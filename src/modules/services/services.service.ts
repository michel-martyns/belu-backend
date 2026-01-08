import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, CACHE_KEYS, CACHE_TTL } from '../../redis';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { Service } from '@prisma/client';

@Injectable()
export class ServicesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findAll(tenantId: string) {
    const cacheKey = CACHE_KEYS.SERVICES(tenantId);

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.service.findMany({
          where: { tenantId },
          orderBy: { name: 'asc' },
          include: {
            providerServices: {
              include: {
                provider: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        });
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async findActive(tenantId: string) {
    const cacheKey = CACHE_KEYS.SERVICES_ACTIVE(tenantId);

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.service.findMany({
          where: { tenantId, active: true },
          orderBy: { name: 'asc' },
        });
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async findById(id: string, tenantId: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado');
    }

    return service;
  }

  async create(tenantId: string, dto: CreateServiceDto) {
    const service = await this.prisma.service.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        price: new Decimal(dto.price),
        active: dto.active ?? true,
      },
    });

    // Invalida cache
    await this.redis.invalidateServices(tenantId);

    return service;
  }

  async update(id: string, tenantId: string, dto: UpdateServiceDto) {
    await this.findById(id, tenantId);

    const service = await this.prisma.service.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        duration: dto.duration,
        price: dto.price !== undefined ? new Decimal(dto.price) : undefined,
        active: dto.active,
      },
    });

    // Invalida cache
    await this.redis.invalidateServices(tenantId);

    return service;
  }

  async delete(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    // Soft delete é aplicado automaticamente pelo middleware
    const result = await this.prisma.service.delete({
      where: { id },
    });

    // Invalida cache
    await this.redis.invalidateServices(tenantId);

    return result;
  }

  async count(tenantId: string) {
    return this.prisma.service.count({
      where: { tenantId },
    });
  }

  // ========== Métodos para Soft Delete ==========

  /**
   * Busca todos os serviços deletados (lixeira)
   */
  async findDeleted(tenantId: string): Promise<Service[]> {
    return this.prisma.findOnlyDeleted<Service>('service', {
      where: { tenantId },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /**
   * Restaura um serviço deletado
   */
  async restore(id: string, tenantId: string) {
    // Verifica se existe na lixeira
    const deleted = await this.prisma.findOnlyDeleted<Service>('service', {
      where: { id, tenantId },
    });

    if (!deleted || deleted.length === 0) {
      throw new NotFoundException('Serviço não encontrado na lixeira');
    }

    await this.prisma.restore('service', { id, tenantId });

    // Invalida cache
    await this.redis.invalidateServices(tenantId);

    return this.findById(id, tenantId);
  }

  /**
   * Deleta permanentemente um serviço
   */
  async hardDelete(id: string, tenantId: string) {
    // Verifica se existe (na lixeira ou não)
    const services = await this.prisma.findWithDeleted<Service>('service', {
      where: { id, tenantId },
    });

    if (!services || services.length === 0) {
      throw new NotFoundException('Serviço não encontrado');
    }

    const result = await this.prisma.hardDelete('service', { id });

    // Invalida cache
    await this.redis.invalidateServices(tenantId);

    return result;
  }
}
