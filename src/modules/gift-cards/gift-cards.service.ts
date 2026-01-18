import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PurchaseGiftCardDto,
  CreateGiftCardDto,
  UpdateGiftCardDto,
  RedeemGiftCardDto,
  RefundGiftCardDto,
  AdjustBalanceDto,
  QueryGiftCardsDto,
} from './dto';
import { GiftCardStatus, GiftCardTransactionType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { randomBytes } from 'crypto';

@Injectable()
export class GiftCardsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // GERAÇÃO DE CÓDIGO
  // ============================================================================

  private generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments: string[] = [];
    for (let i = 0; i < 3; i++) {
      let segment = '';
      for (let j = 0; j < 4; j++) {
        segment += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      segments.push(segment);
    }
    return `GIFT-${segments.join('-')}`;
  }

  private async generateUniqueCode(): Promise<string> {
    let code: string;
    let exists = true;
    let attempts = 0;

    while (exists && attempts < 10) {
      code = this.generateCode();
      const existing = await this.prisma.giftCard.findUnique({
        where: { code },
      });
      exists = !!existing;
      attempts++;
    }

    if (exists) {
      throw new BadRequestException('Não foi possível gerar um código único');
    }

    return code!;
  }

  // ============================================================================
  // CRUD
  // ============================================================================

  async findAll(tenantId: string, query?: QueryGiftCardsDto) {
    const where: Prisma.GiftCardWhereInput = { tenantId };

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { purchaserName: { contains: query.search, mode: 'insensitive' } },
        { purchaserEmail: { contains: query.search, mode: 'insensitive' } },
        { recipientName: { contains: query.search, mode: 'insensitive' } },
        { recipientEmail: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (!query?.includeExpired) {
      const today = new Date();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: today } },
          ],
        },
      ];
    }

    if (!query?.includeDepleted) {
      where.status = { not: GiftCardStatus.DEPLETED };
    }

    const [giftCards, total] = await Promise.all([
      this.prisma.giftCard.findMany({
        where,
        include: {
          purchasedBy: {
            select: { id: true, name: true, email: true },
          },
          _count: { select: { transactions: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.giftCard.count({ where }),
    ]);

    return {
      data: giftCards,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findById(id: string, tenantId: string) {
    const giftCard = await this.prisma.giftCard.findFirst({
      where: { id, tenantId },
      include: {
        purchasedBy: {
          select: { id: true, name: true, email: true, phone: true },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            client: {
              select: { id: true, name: true },
            },
            appointment: {
              select: { id: true, date: true },
            },
          },
        },
      },
    });

    if (!giftCard) {
      throw new NotFoundException('Gift card não encontrado');
    }

    return giftCard;
  }

  async findByCode(code: string, tenantId: string) {
    const giftCard = await this.prisma.giftCard.findFirst({
      where: { code, tenantId },
      include: {
        purchasedBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (!giftCard) {
      throw new NotFoundException('Gift card não encontrado');
    }

    return giftCard;
  }

  // ============================================================================
  // COMPRA / CRIAÇÃO
  // ============================================================================

  async purchase(tenantId: string, dto: PurchaseGiftCardDto, clientId?: string) {
    const code = await this.generateUniqueCode();

    const expirationDays = dto.expirationDays || 365;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const giftCard = await this.prisma.giftCard.create({
      data: {
        tenantId,
        code,
        originalValue: new Decimal(dto.value),
        currentBalance: new Decimal(dto.value),
        purchasedById: clientId,
        purchaserName: dto.purchaserName,
        purchaserEmail: dto.purchaserEmail,
        purchaserPhone: dto.purchaserPhone,
        recipientName: dto.recipientName,
        recipientEmail: dto.recipientEmail,
        recipientPhone: dto.recipientPhone,
        message: dto.message,
        status: GiftCardStatus.ACTIVE,
        activatedAt: new Date(),
        expiresAt,
      },
    });

    // Registrar transação de compra
    await this.prisma.giftCardTransaction.create({
      data: {
        tenantId,
        giftCardId: giftCard.id,
        clientId,
        type: GiftCardTransactionType.PURCHASE,
        amount: new Decimal(dto.value),
        balanceBefore: new Decimal(0),
        balanceAfter: new Decimal(dto.value),
        description: 'Compra de gift card',
      },
    });

    return giftCard;
  }

  async create(tenantId: string, dto: CreateGiftCardDto, userId?: string) {
    const code = await this.generateUniqueCode();

    const expirationDays = dto.expirationDays || 365;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const status = dto.status || GiftCardStatus.ACTIVE;
    const activatedAt = status === GiftCardStatus.ACTIVE ? new Date() : null;

    const giftCard = await this.prisma.giftCard.create({
      data: {
        tenantId,
        code,
        originalValue: new Decimal(dto.value),
        currentBalance: new Decimal(dto.value),
        purchaserName: dto.purchaserName,
        purchaserEmail: dto.purchaserEmail,
        purchaserPhone: dto.purchaserPhone,
        recipientName: dto.recipientName,
        recipientEmail: dto.recipientEmail,
        recipientPhone: dto.recipientPhone,
        message: dto.message,
        status,
        activatedAt,
        expiresAt,
        paymentMethod: dto.paymentMethod,
        paymentId: dto.paymentId,
      },
    });

    // Registrar transação de criação
    await this.prisma.giftCardTransaction.create({
      data: {
        tenantId,
        giftCardId: giftCard.id,
        type: GiftCardTransactionType.PURCHASE,
        amount: new Decimal(dto.value),
        balanceBefore: new Decimal(0),
        balanceAfter: new Decimal(dto.value),
        description: 'Gift card criado manualmente',
        createdBy: userId,
      },
    });

    return giftCard;
  }

  async update(id: string, tenantId: string, dto: UpdateGiftCardDto) {
    await this.findById(id, tenantId);

    const giftCard = await this.prisma.giftCard.update({
      where: { id },
      data: {
        recipientName: dto.recipientName,
        recipientEmail: dto.recipientEmail,
        recipientPhone: dto.recipientPhone,
        message: dto.message,
        status: dto.status,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    return giftCard;
  }

  async delete(id: string, tenantId: string) {
    const giftCard = await this.findById(id, tenantId);

    // Não permitir excluir gift cards que já foram usados
    if (Number(giftCard.currentBalance) < Number(giftCard.originalValue)) {
      throw new BadRequestException('Não é possível excluir um gift card que já foi utilizado');
    }

    await this.prisma.giftCard.delete({
      where: { id },
    });

    return { success: true };
  }

  // ============================================================================
  // VALIDAÇÃO
  // ============================================================================

  async validate(code: string, tenantId: string) {
    const giftCard = await this.findByCode(code, tenantId);

    const isValid = this.isGiftCardValid(giftCard);
    const issues: string[] = [];

    if (!giftCard.status || giftCard.status === GiftCardStatus.PENDING) {
      issues.push('Gift card ainda não foi ativado');
    }

    if (giftCard.status === GiftCardStatus.CANCELLED) {
      issues.push('Gift card foi cancelado');
    }

    if (giftCard.status === GiftCardStatus.DEPLETED) {
      issues.push('Gift card sem saldo');
    }

    if (giftCard.status === GiftCardStatus.EXPIRED) {
      issues.push('Gift card expirado');
    }

    if (giftCard.expiresAt && new Date(giftCard.expiresAt) < new Date()) {
      issues.push('Gift card expirado');
    }

    return {
      valid: isValid,
      issues,
      giftCard: {
        id: giftCard.id,
        code: giftCard.code,
        originalValue: Number(giftCard.originalValue),
        currentBalance: Number(giftCard.currentBalance),
        status: giftCard.status,
        expiresAt: giftCard.expiresAt,
        recipientName: giftCard.recipientName,
      },
    };
  }

  private isGiftCardValid(giftCard: any): boolean {
    if (!giftCard) return false;
    if (giftCard.status !== GiftCardStatus.ACTIVE && giftCard.status !== GiftCardStatus.PARTIALLY_USED) {
      return false;
    }
    if (Number(giftCard.currentBalance) <= 0) return false;
    if (giftCard.expiresAt && new Date(giftCard.expiresAt) < new Date()) return false;
    return true;
  }

  // ============================================================================
  // RESGATE / USO
  // ============================================================================

  async redeem(tenantId: string, dto: RedeemGiftCardDto, userId?: string) {
    const giftCard = await this.findByCode(dto.code, tenantId);

    // Validações
    if (!this.isGiftCardValid(giftCard)) {
      throw new BadRequestException('Gift card inválido ou expirado');
    }

    const currentBalance = Number(giftCard.currentBalance);
    if (dto.amount > currentBalance) {
      throw new BadRequestException(`Saldo insuficiente. Saldo atual: R$ ${currentBalance.toFixed(2)}`);
    }

    const newBalance = currentBalance - dto.amount;
    const newStatus = newBalance <= 0
      ? GiftCardStatus.DEPLETED
      : GiftCardStatus.PARTIALLY_USED;

    // Atualizar gift card
    const updatedGiftCard = await this.prisma.giftCard.update({
      where: { id: giftCard.id },
      data: {
        currentBalance: new Decimal(newBalance),
        status: newStatus,
        lastUsedAt: new Date(),
      },
    });

    // Registrar transação
    const transaction = await this.prisma.giftCardTransaction.create({
      data: {
        tenantId,
        giftCardId: giftCard.id,
        appointmentId: dto.appointmentId,
        clientId: dto.clientId,
        type: GiftCardTransactionType.REDEMPTION,
        amount: new Decimal(dto.amount),
        balanceBefore: new Decimal(currentBalance),
        balanceAfter: new Decimal(newBalance),
        description: dto.description || 'Utilização de gift card',
        createdBy: userId,
      },
    });

    return {
      success: true,
      transaction,
      giftCard: {
        id: updatedGiftCard.id,
        code: updatedGiftCard.code,
        previousBalance: currentBalance,
        amountUsed: dto.amount,
        newBalance,
        status: newStatus,
      },
    };
  }

  // ============================================================================
  // ESTORNO
  // ============================================================================

  async refund(id: string, tenantId: string, dto: RefundGiftCardDto, userId?: string) {
    const giftCard = await this.findById(id, tenantId);

    const currentBalance = Number(giftCard.currentBalance);
    const originalValue = Number(giftCard.originalValue);
    const newBalance = Math.min(currentBalance + dto.amount, originalValue);

    // Determinar novo status
    let newStatus = giftCard.status;
    if (newBalance > 0 && giftCard.status === GiftCardStatus.DEPLETED) {
      newStatus = GiftCardStatus.PARTIALLY_USED;
    }
    if (newBalance >= originalValue) {
      newStatus = GiftCardStatus.ACTIVE;
    }

    // Atualizar gift card
    const updatedGiftCard = await this.prisma.giftCard.update({
      where: { id },
      data: {
        currentBalance: new Decimal(newBalance),
        status: newStatus,
      },
    });

    // Registrar transação
    await this.prisma.giftCardTransaction.create({
      data: {
        tenantId,
        giftCardId: giftCard.id,
        type: GiftCardTransactionType.REFUND,
        amount: new Decimal(dto.amount),
        balanceBefore: new Decimal(currentBalance),
        balanceAfter: new Decimal(newBalance),
        description: dto.description || 'Estorno de valor',
        createdBy: userId,
      },
    });

    return updatedGiftCard;
  }

  // ============================================================================
  // AJUSTE DE SALDO
  // ============================================================================

  async adjustBalance(id: string, tenantId: string, dto: AdjustBalanceDto, userId?: string) {
    const giftCard = await this.findById(id, tenantId);

    const currentBalance = Number(giftCard.currentBalance);
    const originalValue = Number(giftCard.originalValue);
    const newBalance = Math.max(0, Math.min(currentBalance + dto.amount, originalValue * 2)); // Limite de 2x o valor original

    // Determinar novo status
    let newStatus = giftCard.status;
    if (newBalance <= 0) {
      newStatus = GiftCardStatus.DEPLETED;
    } else if (newBalance < originalValue) {
      newStatus = GiftCardStatus.PARTIALLY_USED;
    } else {
      newStatus = GiftCardStatus.ACTIVE;
    }

    // Atualizar gift card
    const updatedGiftCard = await this.prisma.giftCard.update({
      where: { id },
      data: {
        currentBalance: new Decimal(newBalance),
        status: newStatus,
      },
    });

    // Registrar transação
    await this.prisma.giftCardTransaction.create({
      data: {
        tenantId,
        giftCardId: giftCard.id,
        type: GiftCardTransactionType.ADJUSTMENT,
        amount: new Decimal(Math.abs(dto.amount)),
        balanceBefore: new Decimal(currentBalance),
        balanceAfter: new Decimal(newBalance),
        description: dto.description,
        createdBy: userId,
      },
    });

    return updatedGiftCard;
  }

  // ============================================================================
  // CANCELAMENTO
  // ============================================================================

  async cancel(id: string, tenantId: string, userId?: string) {
    const giftCard = await this.findById(id, tenantId);

    const updatedGiftCard = await this.prisma.giftCard.update({
      where: { id },
      data: {
        status: GiftCardStatus.CANCELLED,
      },
    });

    // Registrar transação se tinha saldo
    if (Number(giftCard.currentBalance) > 0) {
      await this.prisma.giftCardTransaction.create({
        data: {
          tenantId,
          giftCardId: giftCard.id,
          type: GiftCardTransactionType.ADJUSTMENT,
          amount: giftCard.currentBalance,
          balanceBefore: giftCard.currentBalance,
          balanceAfter: new Decimal(0),
          description: 'Gift card cancelado',
          createdBy: userId,
        },
      });
    }

    return updatedGiftCard;
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getStats(tenantId: string) {
    const today = new Date();

    const [
      totalGiftCards,
      activeGiftCards,
      totalSold,
      totalRedeemed,
      pendingBalance,
      expiringCount,
    ] = await Promise.all([
      this.prisma.giftCard.count({ where: { tenantId } }),
      this.prisma.giftCard.count({
        where: {
          tenantId,
          status: { in: [GiftCardStatus.ACTIVE, GiftCardStatus.PARTIALLY_USED] },
        },
      }),
      this.prisma.giftCard.aggregate({
        where: { tenantId },
        _sum: { originalValue: true },
      }),
      this.prisma.giftCardTransaction.aggregate({
        where: {
          tenantId,
          type: GiftCardTransactionType.REDEMPTION,
        },
        _sum: { amount: true },
      }),
      this.prisma.giftCard.aggregate({
        where: {
          tenantId,
          status: { in: [GiftCardStatus.ACTIVE, GiftCardStatus.PARTIALLY_USED] },
        },
        _sum: { currentBalance: true },
      }),
      this.prisma.giftCard.count({
        where: {
          tenantId,
          status: { in: [GiftCardStatus.ACTIVE, GiftCardStatus.PARTIALLY_USED] },
          expiresAt: {
            lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 dias
            gte: today,
          },
        },
      }),
    ]);

    return {
      totalGiftCards,
      activeGiftCards,
      totalSold: totalSold._sum.originalValue || 0,
      totalRedeemed: totalRedeemed._sum.amount || 0,
      pendingBalance: pendingBalance._sum.currentBalance || 0,
      expiringIn30Days: expiringCount,
    };
  }

  // ============================================================================
  // TRANSAÇÕES
  // ============================================================================

  async getTransactions(id: string, tenantId: string, limit = 50, offset = 0) {
    await this.findById(id, tenantId);

    const [transactions, total] = await Promise.all([
      this.prisma.giftCardTransaction.findMany({
        where: { giftCardId: id, tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          client: { select: { id: true, name: true } },
          appointment: { select: { id: true, date: true } },
        },
      }),
      this.prisma.giftCardTransaction.count({
        where: { giftCardId: id, tenantId },
      }),
    ]);

    return { data: transactions, total, limit, offset };
  }
}
