import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, CACHE_KEYS, CACHE_TTL } from '../../redis';
import {
  CreateProviderDto,
  UpdateProviderDto,
  SetProviderServicesDto,
  SetProviderScheduleDto,
} from './dto/provider.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { Provider } from '@prisma/client';

@Injectable()
export class ProvidersService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async findAll(tenantId: string) {
    const cacheKey = CACHE_KEYS.PROVIDERS(tenantId);

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.provider.findMany({
          where: { tenantId },
          include: {
            services: {
              include: { service: true },
            },
            schedules: true,
          },
          orderBy: { name: 'asc' },
        });
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async findActive(tenantId: string) {
    const cacheKey = CACHE_KEYS.PROVIDERS_ACTIVE(tenantId);

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.provider.findMany({
          where: { tenantId, active: true },
          include: {
            services: {
              include: { service: true },
            },
            schedules: true,
          },
          orderBy: { name: 'asc' },
        });
      },
      CACHE_TTL.MEDIUM,
    );
  }

  async findById(id: string, tenantId: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, tenantId },
      include: {
        services: {
          include: { service: true },
        },
        schedules: true,
      },
    });

    if (!provider) {
      throw new NotFoundException('Profissional não encontrado');
    }

    return provider;
  }

  async create(tenantId: string, dto: CreateProviderDto) {
    const provider = await this.prisma.provider.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        active: dto.active ?? true,
      },
      include: {
        services: true,
        schedules: true,
      },
    });

    // Invalida cache
    await this.redis.invalidateProviders(tenantId);

    return provider;
  }

  async update(id: string, tenantId: string, dto: UpdateProviderDto) {
    await this.findById(id, tenantId);

    const provider = await this.prisma.provider.update({
      where: { id },
      data: dto,
      include: {
        services: {
          include: { service: true },
        },
        schedules: true,
      },
    });

    // Invalida cache
    await this.redis.invalidateProviders(tenantId);

    return provider;
  }

  async delete(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    // Soft delete é aplicado automaticamente pelo middleware
    const result = await this.prisma.provider.delete({
      where: { id },
    });

    // Invalida cache
    await this.redis.invalidateProviders(tenantId);

    return result;
  }

  async setServices(id: string, tenantId: string, dto: SetProviderServicesDto) {
    await this.findById(id, tenantId);

    await this.prisma.providerService.deleteMany({
      where: { providerId: id },
    });

    await this.prisma.providerService.createMany({
      data: dto.services.map((s) => ({
        providerId: id,
        serviceId: s.serviceId,
        customPrice: s.customPrice ? new Decimal(s.customPrice) : null,
      })),
    });

    // Invalida cache
    await this.redis.invalidateProviders(tenantId);

    return this.findById(id, tenantId);
  }

  async setSchedules(id: string, tenantId: string, dto: SetProviderScheduleDto) {
    await this.findById(id, tenantId);

    await this.prisma.providerSchedule.deleteMany({
      where: { providerId: id },
    });

    await this.prisma.providerSchedule.createMany({
      data: dto.schedules.map((s) => ({
        providerId: id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        isAvailable: s.isAvailable,
      })),
    });

    // Invalida cache
    await this.redis.invalidateProviders(tenantId);

    return this.findById(id, tenantId);
  }

  async count(tenantId: string) {
    return this.prisma.provider.count({
      where: { tenantId },
    });
  }

  // ========== Métodos para Soft Delete ==========

  /**
   * Busca todos os profissionais deletados (lixeira)
   */
  async findDeleted(tenantId: string): Promise<Provider[]> {
    return this.prisma.findOnlyDeleted<Provider>('provider', {
      where: { tenantId },
      orderBy: { deletedAt: 'desc' },
    });
  }

  /**
   * Restaura um profissional deletado
   */
  async restore(id: string, tenantId: string) {
    const deleted = await this.prisma.findOnlyDeleted<Provider>('provider', {
      where: { id, tenantId },
    });

    if (!deleted || deleted.length === 0) {
      throw new NotFoundException('Profissional não encontrado na lixeira');
    }

    await this.prisma.restore('provider', { id, tenantId });

    // Invalida cache
    await this.redis.invalidateProviders(tenantId);

    return this.findById(id, tenantId);
  }

  /**
   * Deleta permanentemente um profissional
   */
  async hardDelete(id: string, tenantId: string) {
    const providers = await this.prisma.findWithDeleted<Provider>('provider', {
      where: { id, tenantId },
    });

    if (!providers || providers.length === 0) {
      throw new NotFoundException('Profissional não encontrado');
    }

    const result = await this.prisma.hardDelete('provider', { id });

    // Invalida cache
    await this.redis.invalidateProviders(tenantId);

    return result;
  }
}
