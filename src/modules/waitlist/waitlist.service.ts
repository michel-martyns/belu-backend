import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WaitlistStatus } from '@prisma/client';
import {
  CreateWaitlistDto,
  CreatePublicWaitlistDto,
  UpdateWaitlistDto,
  QueryWaitlistDto,
} from './dto';

@Injectable()
export class WaitlistService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // CRUD - Operações básicas
  // ============================================================================

  /**
   * Lista todas as entradas da lista de espera de um tenant
   */
  async findAll(tenantId: string, query?: QueryWaitlistDto) {
    const cacheKey = `waitlist:${tenantId}:all`;

    // Se tiver filtros, não usar cache
    if (query?.status || query?.serviceId || query?.providerId || query?.search) {
      return this.findWithFilters(tenantId, query);
    }

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.waitlist.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          include: {
            service: {
              select: { id: true, name: true, duration: true, price: true },
            },
            provider: {
              select: { id: true, name: true },
            },
            client: {
              select: { id: true, name: true, phone: true, email: true },
            },
          },
        });
      },
      300, // TTL 5 minutos
    );
  }

  /**
   * Busca com filtros (sem cache)
   */
  private async findWithFilters(tenantId: string, query: QueryWaitlistDto) {
    const where: any = { tenantId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.serviceId) {
      where.serviceId = query.serviceId;
    }

    if (query.providerId) {
      where.providerId = query.providerId;
    }

    if (query.search) {
      where.OR = [
        { clientName: { contains: query.search, mode: 'insensitive' } },
        { clientPhone: { contains: query.search } },
        { clientEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.waitlist.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        service: {
          select: { id: true, name: true, duration: true, price: true },
        },
        provider: {
          select: { id: true, name: true },
        },
        client: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });
  }

  /**
   * Busca uma entrada por ID
   */
  async findById(id: string, tenantId: string) {
    const entry = await this.prisma.waitlist.findFirst({
      where: { id, tenantId },
      include: {
        service: {
          select: { id: true, name: true, duration: true, price: true },
        },
        provider: {
          select: { id: true, name: true, phone: true },
        },
        client: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException('Entrada na lista de espera não encontrada');
    }

    return entry;
  }

  /**
   * Cria nova entrada na lista de espera (admin)
   */
  async create(tenantId: string, dto: CreateWaitlistDto) {
    // Verificar se o serviço existe
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId, active: true, deletedAt: null },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado');
    }

    // Verificar se o profissional existe (se informado)
    if (dto.providerId) {
      const provider = await this.prisma.provider.findFirst({
        where: { id: dto.providerId, tenantId, active: true, deletedAt: null },
      });

      if (!provider) {
        throw new NotFoundException('Profissional não encontrado');
      }
    }

    // Verificar se o cliente existe (se informado)
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId, deletedAt: null },
      });

      if (!client) {
        throw new NotFoundException('Cliente não encontrado');
      }
    }

    const entry = await this.prisma.waitlist.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        serviceId: dto.serviceId,
        providerId: dto.providerId,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        clientEmail: dto.clientEmail,
        preferredDates: dto.preferredDates,
        preferredPeriod: dto.preferredPeriod || 'ANY',
        notes: dto.notes,
        status: 'PENDING',
      },
      include: {
        service: {
          select: { id: true, name: true, duration: true, price: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return entry;
  }

  /**
   * Cria nova entrada via endpoint público
   */
  async createPublic(tenantId: string, dto: CreatePublicWaitlistDto) {
    // Verificar se o serviço existe
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId, active: true, deletedAt: null },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado');
    }

    // Verificar se o profissional existe (se informado)
    if (dto.providerId) {
      const provider = await this.prisma.provider.findFirst({
        where: { id: dto.providerId, tenantId, active: true, deletedAt: null },
      });

      if (!provider) {
        throw new NotFoundException('Profissional não encontrado');
      }
    }

    // Tentar encontrar cliente existente pelo telefone
    const existingClient = await this.prisma.client.findFirst({
      where: {
        tenantId,
        phone: dto.clientPhone,
        deletedAt: null,
      },
    });

    const entry = await this.prisma.waitlist.create({
      data: {
        tenantId,
        clientId: existingClient?.id,
        serviceId: dto.serviceId,
        providerId: dto.providerId,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        clientEmail: dto.clientEmail,
        preferredDates: dto.preferredDates,
        preferredPeriod: dto.preferredPeriod || 'ANY',
        notes: dto.notes,
        status: 'PENDING',
      },
      include: {
        service: {
          select: { id: true, name: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return {
      id: entry.id,
      message: 'Você foi adicionado à lista de espera',
      service: entry.service?.name,
      provider: entry.provider?.name,
    };
  }

  /**
   * Atualiza uma entrada
   */
  async update(id: string, tenantId: string, dto: UpdateWaitlistDto) {
    // Verificar se existe
    await this.findById(id, tenantId);

    // Verificar profissional se informado
    if (dto.providerId) {
      const provider = await this.prisma.provider.findFirst({
        where: { id: dto.providerId, tenantId, active: true, deletedAt: null },
      });

      if (!provider) {
        throw new NotFoundException('Profissional não encontrado');
      }
    }

    const entry = await this.prisma.waitlist.update({
      where: { id },
      data: {
        status: dto.status,
        preferredDates: dto.preferredDates,
        preferredPeriod: dto.preferredPeriod,
        notes: dto.notes,
        providerId: dto.providerId,
      },
      include: {
        service: {
          select: { id: true, name: true, duration: true, price: true },
        },
        provider: {
          select: { id: true, name: true },
        },
        client: {
          select: { id: true, name: true, phone: true, email: true },
        },
      },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return entry;
  }

  /**
   * Remove uma entrada da lista de espera
   */
  async delete(id: string, tenantId: string) {
    // Verificar se existe
    await this.findById(id, tenantId);

    await this.prisma.waitlist.delete({
      where: { id },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return { message: 'Entrada removida da lista de espera' };
  }

  // ============================================================================
  // AÇÕES ESPECIAIS
  // ============================================================================

  /**
   * Notifica o cliente de vaga disponível
   */
  async notify(id: string, tenantId: string) {
    const entry = await this.findById(id, tenantId);

    if (entry.status !== 'PENDING') {
      throw new NotFoundException('Apenas entradas pendentes podem ser notificadas');
    }

    // Atualizar status
    const updated = await this.prisma.waitlist.update({
      where: { id },
      data: {
        status: 'NOTIFIED',
        notifiedAt: new Date(),
        // Expira em 24 horas após notificação
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: {
        service: {
          select: { id: true, name: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
    });

    // TODO: Enviar notificação via WhatsApp/SMS/Email
    // await this.notificationService.sendWaitlistNotification(entry);

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return {
      ...updated,
      message: 'Cliente notificado com sucesso',
    };
  }

  /**
   * Marca entrada como agendada
   */
  async markAsScheduled(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    const updated = await this.prisma.waitlist.update({
      where: { id },
      data: {
        status: 'SCHEDULED',
      },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return updated;
  }

  /**
   * Cancela entrada na lista de espera
   */
  async cancel(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    const updated = await this.prisma.waitlist.update({
      where: { id },
      data: {
        status: 'CANCELLED',
      },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return updated;
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  /**
   * Retorna estatísticas da lista de espera
   */
  async getStats(tenantId: string) {
    const [total, pending, notified, scheduled, expired, cancelled] =
      await Promise.all([
        this.prisma.waitlist.count({ where: { tenantId } }),
        this.prisma.waitlist.count({ where: { tenantId, status: 'PENDING' } }),
        this.prisma.waitlist.count({ where: { tenantId, status: 'NOTIFIED' } }),
        this.prisma.waitlist.count({ where: { tenantId, status: 'SCHEDULED' } }),
        this.prisma.waitlist.count({ where: { tenantId, status: 'EXPIRED' } }),
        this.prisma.waitlist.count({ where: { tenantId, status: 'CANCELLED' } }),
      ]);

    return {
      total,
      pending,
      notified,
      scheduled,
      expired,
      cancelled,
    };
  }

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  /**
   * Invalida cache da lista de espera
   */
  private async invalidateCache(tenantId: string) {
    await this.redis.del(`waitlist:${tenantId}:all`);
  }

  /**
   * Busca tenant pelo slug (para endpoints públicos)
   */
  async getTenantBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    return tenant;
  }
}
