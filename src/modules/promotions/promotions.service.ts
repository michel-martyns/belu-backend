import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  QueryPromotionsDto,
  CheckPromotionsDto,
  ApplyPromotionDto,
} from './dto';
import { PromotionType, DiscountType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface ApplicablePromotion {
  id: string;
  name: string;
  type: PromotionType;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  finalPrice: number;
  showBadge: boolean;
}

@Injectable()
export class PromotionsService {
  private readonly CACHE_PREFIX = 'promotions';
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // CRUD
  // ============================================================================

  async findAll(tenantId: string, query?: QueryPromotionsDto) {
    const where: Prisma.PromotionWhereInput = { tenantId };

    if (query?.type) {
      where.type = query.type;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    // Por padrão, não incluir promoções expiradas
    if (!query?.includeExpired) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.OR = [
        { validTo: null },
        { validTo: { gte: today } },
      ];
    }

    const [promotions, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.promotion.count({ where }),
    ]);

    return {
      data: promotions,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findById(id: string, tenantId: string) {
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, tenantId },
      include: {
        usages: {
          take: 50,
          orderBy: { usedAt: 'desc' },
        },
        _count: {
          select: { usages: true },
        },
      },
    });

    if (!promotion) {
      throw new NotFoundException('Promoção não encontrada');
    }

    return promotion;
  }

  async create(tenantId: string, dto: CreatePromotionDto, userId?: string) {
    // Validar que o valor de desconto faz sentido
    if (dto.discountType === DiscountType.PERCENTAGE && dto.discountValue > 100) {
      throw new BadRequestException('Desconto percentual não pode ser maior que 100%');
    }

    const promotion = await this.prisma.promotion.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        discountType: dto.discountType,
        discountValue: new Decimal(dto.discountValue),
        validFrom: new Date(dto.validFrom),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        daysOfWeek: dto.daysOfWeek || [],
        startTime: dto.startTime,
        endTime: dto.endTime,
        serviceIds: dto.serviceIds || [],
        providerIds: dto.providerIds || [],
        minPrice: dto.minPrice ? new Decimal(dto.minPrice) : null,
        maxDiscount: dto.maxDiscount ? new Decimal(dto.maxDiscount) : null,
        usageLimit: dto.usageLimit,
        usageLimitPerClient: dto.usageLimitPerClient,
        stackable: dto.stackable ?? false,
        autoApply: dto.autoApply ?? true,
        showBadge: dto.showBadge ?? true,
        isActive: dto.isActive ?? true,
        createdBy: userId,
      },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return promotion;
  }

  async update(id: string, tenantId: string, dto: UpdatePromotionDto) {
    await this.findById(id, tenantId);

    // Validar que o valor de desconto faz sentido
    if (dto.discountType === DiscountType.PERCENTAGE && dto.discountValue && dto.discountValue > 100) {
      throw new BadRequestException('Desconto percentual não pode ser maior que 100%');
    }

    const promotion = await this.prisma.promotion.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        discountType: dto.discountType,
        discountValue: dto.discountValue !== undefined ? new Decimal(dto.discountValue) : undefined,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        daysOfWeek: dto.daysOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        serviceIds: dto.serviceIds,
        providerIds: dto.providerIds,
        minPrice: dto.minPrice !== undefined ? (dto.minPrice ? new Decimal(dto.minPrice) : null) : undefined,
        maxDiscount: dto.maxDiscount !== undefined ? (dto.maxDiscount ? new Decimal(dto.maxDiscount) : null) : undefined,
        usageLimit: dto.usageLimit,
        usageLimitPerClient: dto.usageLimitPerClient,
        stackable: dto.stackable,
        autoApply: dto.autoApply,
        showBadge: dto.showBadge,
        isActive: dto.isActive,
      },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return promotion;
  }

  async delete(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    await this.prisma.promotion.delete({
      where: { id },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return { success: true };
  }

  async toggleActive(id: string, tenantId: string) {
    const promotion = await this.findById(id, tenantId);

    const updated = await this.prisma.promotion.update({
      where: { id },
      data: { isActive: !promotion.isActive },
    });

    // Invalidar cache
    await this.invalidateCache(tenantId);

    return updated;
  }

  // ============================================================================
  // VERIFICAR PROMOÇÕES APLICÁVEIS
  // ============================================================================

  async checkApplicable(tenantId: string, dto: CheckPromotionsDto): Promise<ApplicablePromotion[]> {
    const date = new Date(dto.date);
    const dayOfWeek = date.getDay();
    const time = dto.time;

    // Buscar promoções ativas e válidas
    const promotions = await this.prisma.promotion.findMany({
      where: {
        tenantId,
        isActive: true,
        autoApply: true,
        validFrom: { lte: date },
        OR: [
          { validTo: null },
          { validTo: { gte: date } },
        ],
      },
    });

    const applicable: ApplicablePromotion[] = [];

    for (const promo of promotions) {
      // Verificar dia da semana
      if (promo.daysOfWeek.length > 0 && !promo.daysOfWeek.includes(dayOfWeek)) {
        continue;
      }

      // Verificar horário
      if (promo.startTime && promo.endTime) {
        if (time < promo.startTime || time > promo.endTime) {
          continue;
        }
      }

      // Verificar serviço
      if (promo.serviceIds.length > 0 && !promo.serviceIds.includes(dto.serviceId)) {
        continue;
      }

      // Verificar profissional
      if (dto.providerId && promo.providerIds.length > 0 && !promo.providerIds.includes(dto.providerId)) {
        continue;
      }

      // Verificar preço mínimo
      if (promo.minPrice && dto.price < Number(promo.minPrice)) {
        continue;
      }

      // Verificar limite de uso total
      if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
        continue;
      }

      // Verificar limite por cliente
      if (dto.clientId && promo.usageLimitPerClient) {
        const clientUsage = await this.prisma.promotionUsage.count({
          where: {
            promotionId: promo.id,
            clientId: dto.clientId,
          },
        });
        if (clientUsage >= promo.usageLimitPerClient) {
          continue;
        }
      }

      // Verificar tipo especial: FIRST_VISIT
      if (promo.type === PromotionType.FIRST_VISIT && dto.clientId) {
        const previousAppointments = await this.prisma.appointment.count({
          where: {
            clientId: dto.clientId,
            status: 'COMPLETED',
          },
        });
        if (previousAppointments > 0) {
          continue;
        }
      }

      // Verificar tipo especial: BIRTHDAY
      if (promo.type === PromotionType.BIRTHDAY && dto.clientId) {
        const client = await this.prisma.client.findUnique({
          where: { id: dto.clientId },
          select: { birthDate: true },
        });
        if (!client?.birthDate) {
          continue;
        }
        const birthDate = new Date(client.birthDate);
        const today = new Date();
        if (birthDate.getMonth() !== today.getMonth() || birthDate.getDate() !== today.getDate()) {
          continue;
        }
      }

      // Calcular desconto
      const { discountAmount, finalPrice } = this.calculateDiscount(
        dto.price,
        promo.discountType,
        Number(promo.discountValue),
        promo.maxDiscount ? Number(promo.maxDiscount) : undefined,
      );

      applicable.push({
        id: promo.id,
        name: promo.name,
        type: promo.type,
        discountType: promo.discountType,
        discountValue: Number(promo.discountValue),
        discountAmount,
        finalPrice,
        showBadge: promo.showBadge,
      });
    }

    // Ordenar por maior desconto
    applicable.sort((a, b) => b.discountAmount - a.discountAmount);

    return applicable;
  }

  // ============================================================================
  // APLICAR PROMOÇÃO
  // ============================================================================

  async apply(tenantId: string, dto: ApplyPromotionDto) {
    const promotion = await this.findById(dto.promotionId, tenantId);

    // Verificar se está ativa
    if (!promotion.isActive) {
      throw new BadRequestException('Promoção não está ativa');
    }

    // Verificar validade
    const today = new Date();
    if (promotion.validFrom > today) {
      throw new BadRequestException('Promoção ainda não começou');
    }
    if (promotion.validTo && promotion.validTo < today) {
      throw new BadRequestException('Promoção expirada');
    }

    // Verificar limite de uso
    if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
      throw new BadRequestException('Limite de uso da promoção atingido');
    }

    // Calcular desconto
    const { discountAmount, finalPrice } = this.calculateDiscount(
      dto.originalPrice,
      promotion.discountType,
      Number(promotion.discountValue),
      promotion.maxDiscount ? Number(promotion.maxDiscount) : undefined,
    );

    // Registrar uso
    const usage = await this.prisma.promotionUsage.create({
      data: {
        tenantId,
        promotionId: dto.promotionId,
        appointmentId: dto.appointmentId,
        clientId: dto.clientId,
        originalPrice: new Decimal(dto.originalPrice),
        discountAmount: new Decimal(discountAmount),
        finalPrice: new Decimal(finalPrice),
      },
    });

    // Incrementar contador
    await this.prisma.promotion.update({
      where: { id: dto.promotionId },
      data: { usedCount: { increment: 1 } },
    });

    return {
      usage,
      originalPrice: dto.originalPrice,
      discountAmount,
      finalPrice,
      promotion: {
        id: promotion.id,
        name: promotion.name,
        type: promotion.type,
      },
    };
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalPromotions,
      activePromotions,
      totalUsages,
      totalDiscount,
      topPromotions,
    ] = await Promise.all([
      this.prisma.promotion.count({ where: { tenantId } }),
      this.prisma.promotion.count({
        where: {
          tenantId,
          isActive: true,
          validFrom: { lte: today },
          OR: [
            { validTo: null },
            { validTo: { gte: today } },
          ],
        },
      }),
      this.prisma.promotionUsage.count({ where: { tenantId } }),
      this.prisma.promotionUsage.aggregate({
        where: { tenantId },
        _sum: { discountAmount: true },
      }),
      this.prisma.promotion.findMany({
        where: { tenantId },
        orderBy: { usedCount: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          type: true,
          usedCount: true,
          discountType: true,
          discountValue: true,
        },
      }),
    ]);

    return {
      totalPromotions,
      activePromotions,
      totalUsages,
      totalDiscount: totalDiscount._sum.discountAmount || 0,
      topPromotions,
    };
  }

  // ============================================================================
  // PROMOÇÕES PARA EXIBIÇÃO NA AGENDA
  // ============================================================================

  async getActiveForSchedule(
    tenantId: string,
    date: string,
    serviceId?: string,
    providerId?: string,
  ) {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();

    const promotions = await this.prisma.promotion.findMany({
      where: {
        tenantId,
        isActive: true,
        showBadge: true,
        validFrom: { lte: dateObj },
        OR: [
          { validTo: null },
          { validTo: { gte: dateObj } },
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        discountType: true,
        discountValue: true,
        daysOfWeek: true,
        startTime: true,
        endTime: true,
        serviceIds: true,
        providerIds: true,
      },
    });

    // Filtrar por dia da semana, serviço e profissional
    return promotions.filter((promo) => {
      if (promo.daysOfWeek.length > 0 && !promo.daysOfWeek.includes(dayOfWeek)) {
        return false;
      }
      if (serviceId && promo.serviceIds.length > 0 && !promo.serviceIds.includes(serviceId)) {
        return false;
      }
      if (providerId && promo.providerIds.length > 0 && !promo.providerIds.includes(providerId)) {
        return false;
      }
      return true;
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private calculateDiscount(
    price: number,
    discountType: DiscountType,
    discountValue: number,
    maxDiscount?: number,
  ): { discountAmount: number; finalPrice: number } {
    let discountAmount: number;

    if (discountType === DiscountType.PERCENTAGE) {
      discountAmount = (price * discountValue) / 100;
    } else {
      discountAmount = discountValue;
    }

    // Aplicar limite máximo de desconto
    if (maxDiscount && discountAmount > maxDiscount) {
      discountAmount = maxDiscount;
    }

    // Não pode ser maior que o preço
    if (discountAmount > price) {
      discountAmount = price;
    }

    const finalPrice = Math.max(0, price - discountAmount);

    return {
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalPrice: Math.round(finalPrice * 100) / 100,
    };
  }

  private async invalidateCache(tenantId: string) {
    const pattern = `${this.CACHE_PREFIX}:${tenantId}:*`;
    await this.redis.delByPattern(pattern);
  }
}
