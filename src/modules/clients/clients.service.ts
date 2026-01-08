import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, CACHE_KEYS, CACHE_TTL } from '../../redis';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { Client } from '@prisma/client';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findAll(tenantId: string) {
    const cacheKey = CACHE_KEYS.CLIENTS(tenantId);

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.client.findMany({
          where: { tenantId },
          orderBy: { name: 'asc' },
        });
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async findById(id: string, tenantId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return client;
  }

  async findHistory(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    return this.prisma.appointment.findMany({
      where: { clientId: id, tenantId },
      include: {
        service: true,
        provider: true,
      },
      orderBy: { date: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateClientDto) {
    const client = await this.prisma.client.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
      },
    });

    // Invalida cache
    await this.redis.invalidateClients(tenantId);

    return client;
  }

  async update(id: string, tenantId: string, dto: UpdateClientDto) {
    await this.findById(id, tenantId);

    const client = await this.prisma.client.update({
      where: { id },
      data: dto,
    });

    // Invalida cache
    await this.redis.invalidateClients(tenantId);

    return client;
  }

  async delete(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    // Soft delete é aplicado automaticamente pelo middleware
    const result = await this.prisma.client.delete({
      where: { id },
    });

    // Invalida cache
    await this.redis.invalidateClients(tenantId);

    return result;
  }

  async search(tenantId: string, query: string) {
    return this.prisma.client.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }

  async count(tenantId: string) {
    return this.prisma.client.count({
      where: { tenantId },
    });
  }

  // ========== Métodos para Soft Delete ==========

  /**
   * Busca todos os clientes deletados (lixeira)
   */
  async findDeleted(tenantId: string): Promise<Client[]> {
    return this.prisma.findOnlyDeleted<Client>('client', {
      where: { tenantId },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /**
   * Restaura um cliente deletado
   */
  async restore(id: string, tenantId: string) {
    const deleted = await this.prisma.findOnlyDeleted<Client>('client', {
      where: { id, tenantId },
    });

    if (!deleted || deleted.length === 0) {
      throw new NotFoundException('Cliente não encontrado na lixeira');
    }

    await this.prisma.restore('client', { id, tenantId });

    // Invalida cache
    await this.redis.invalidateClients(tenantId);

    return this.findById(id, tenantId);
  }

  /**
   * Deleta permanentemente um cliente
   */
  async hardDelete(id: string, tenantId: string) {
    const clients = await this.prisma.findWithDeleted<Client>('client', {
      where: { id, tenantId },
    });

    if (!clients || clients.length === 0) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const result = await this.prisma.hardDelete('client', { id });

    // Invalida cache
    await this.redis.invalidateClients(tenantId);

    return result;
  }
}
