import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import {
  UpdateLoyaltyConfigDto,
  CreateTransactionDto,
  QueryTransactionsDto,
  CreateRedemptionDto,
  QueryRedemptionsDto,
  LoyaltyConfigResponse,
  LoyaltyBalanceResponse,
  LoyaltyTransactionResponse,
  LoyaltyRedemptionResponse,
  LoyaltyStatsResponse,
  LoyaltyLeaderboardEntry,
  LoyaltyTransactionType,
  RedemptionStatus,
} from './dto';

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // CONFIGURAÇÃO
  // ============================================================================

  async getConfig(tenantId: string): Promise<LoyaltyConfigResponse> {
    let config = await this.prisma.loyaltyConfig.findUnique({
      where: { tenantId },
    });

    // Se não existir, cria configuração padrão
    if (!config) {
      config = await this.prisma.loyaltyConfig.create({
        data: { tenantId },
      });
    }

    return {
      id: config.id,
      tenantId: config.tenantId,
      pointsPerCurrency: config.pointsPerCurrency,
      pointsRedemptionValue: Number(config.pointsRedemptionValue),
      minimumRedemption: config.minimumRedemption,
      expirationMonths: config.expirationMonths,
      birthdayMultiplier: Number(config.birthdayMultiplier),
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  async updateConfig(
    tenantId: string,
    dto: UpdateLoyaltyConfigDto,
  ): Promise<LoyaltyConfigResponse> {
    // Garante que a config existe
    await this.getConfig(tenantId);

    const config = await this.prisma.loyaltyConfig.update({
      where: { tenantId },
      data: {
        ...(dto.pointsPerCurrency !== undefined && {
          pointsPerCurrency: dto.pointsPerCurrency,
        }),
        ...(dto.pointsRedemptionValue !== undefined && {
          pointsRedemptionValue: dto.pointsRedemptionValue,
        }),
        ...(dto.minimumRedemption !== undefined && {
          minimumRedemption: dto.minimumRedemption,
        }),
        ...(dto.expirationMonths !== undefined && {
          expirationMonths: dto.expirationMonths,
        }),
        ...(dto.birthdayMultiplier !== undefined && {
          birthdayMultiplier: dto.birthdayMultiplier,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return {
      id: config.id,
      tenantId: config.tenantId,
      pointsPerCurrency: config.pointsPerCurrency,
      pointsRedemptionValue: Number(config.pointsRedemptionValue),
      minimumRedemption: config.minimumRedemption,
      expirationMonths: config.expirationMonths,
      birthdayMultiplier: Number(config.birthdayMultiplier),
      isActive: config.isActive,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  // ============================================================================
  // SALDO DO CLIENTE
  // ============================================================================

  async getClientBalance(
    tenantId: string,
    clientId: string,
  ): Promise<LoyaltyBalanceResponse> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // Buscar todas as transações do cliente
    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { tenantId, clientId },
    });

    // Calcular totais
    const now = new Date();
    let totalEarned = 0;
    let totalRedeemed = 0;
    let totalExpired = 0;
    let currentBalance = 0;

    for (const t of transactions) {
      if (t.type === 'EARNED' || t.type === 'BONUS' || t.type === 'ADJUSTMENT') {
        if (t.points > 0) {
          totalEarned += t.points;
          // Verificar se expirou
          if (t.expiresAt && t.expiresAt < now) {
            totalExpired += t.points;
          } else {
            currentBalance += t.points;
          }
        } else {
          // Ajuste negativo
          currentBalance += t.points;
        }
      } else if (t.type === 'REDEEMED') {
        totalRedeemed += Math.abs(t.points);
        currentBalance += t.points; // points é negativo em resgate
      } else if (t.type === 'EXPIRED') {
        totalExpired += Math.abs(t.points);
      }
    }

    // Buscar resgates pendentes
    const pendingRedemptions = await this.prisma.loyaltyRedemption.findMany({
      where: { tenantId, clientId, status: 'PENDING' },
    });

    const pendingPoints = pendingRedemptions.reduce(
      (sum, r) => sum + r.pointsUsed,
      0,
    );

    return {
      clientId,
      clientName: client.name,
      totalEarned,
      totalRedeemed,
      totalExpired,
      currentBalance: Math.max(0, currentBalance),
      pendingRedemptions: pendingPoints,
      availableBalance: Math.max(0, currentBalance - pendingPoints),
    };
  }

  // ============================================================================
  // HISTÓRICO DE TRANSAÇÕES
  // ============================================================================

  async getClientHistory(
    tenantId: string,
    clientId: string,
    query: QueryTransactionsDto,
  ): Promise<{ data: LoyaltyTransactionResponse[]; total: number }> {
    const where: any = { tenantId, clientId };

    if (query.type) {
      where.type = query.type;
    }

    const [transactions, total] = await Promise.all([
      this.prisma.loyaltyTransaction.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          appointment: {
            select: {
              id: true,
              date: true,
              service: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit || 20,
        skip: query.offset || 0,
      }),
      this.prisma.loyaltyTransaction.count({ where }),
    ]);

    return {
      data: transactions.map((t) => ({
        id: t.id,
        clientId: t.clientId,
        appointmentId: t.appointmentId,
        type: t.type as LoyaltyTransactionType,
        points: t.points,
        description: t.description,
        expiresAt: t.expiresAt,
        createdAt: t.createdAt,
        client: t.client,
        appointment: t.appointment
          ? {
              id: t.appointment.id,
              date: t.appointment.date,
              service: t.appointment.service,
            }
          : undefined,
      })),
      total,
    };
  }

  // ============================================================================
  // CREDITAR PONTOS (Chamado após conclusão de atendimento)
  // ============================================================================

  async earnPoints(
    tenantId: string,
    clientId: string,
    appointmentId: string,
    amount: Decimal | number,
  ): Promise<LoyaltyTransactionResponse | null> {
    const config = await this.getConfig(tenantId);

    if (!config.isActive) {
      return null; // Programa de fidelidade desativado
    }

    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      return null;
    }

    // Calcular pontos
    const amountNum = typeof amount === 'number' ? amount : Number(amount);
    let points = Math.floor(amountNum * config.pointsPerCurrency);

    // Verificar se é aniversário
    if (client.birthDate) {
      const today = new Date();
      const birthDate = new Date(client.birthDate);
      if (
        today.getDate() === birthDate.getDate() &&
        today.getMonth() === birthDate.getMonth()
      ) {
        points = Math.floor(points * config.birthdayMultiplier);
      }
    }

    if (points <= 0) {
      return null;
    }

    // Calcular data de expiração
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + config.expirationMonths);

    // Verificar se já existe transação para este agendamento
    const existing = await this.prisma.loyaltyTransaction.findFirst({
      where: { tenantId, clientId, appointmentId, type: 'EARNED' },
    });

    if (existing) {
      return null; // Já foi creditado
    }

    const transaction = await this.prisma.loyaltyTransaction.create({
      data: {
        tenantId,
        clientId,
        appointmentId,
        type: 'EARNED',
        points,
        description: `Pontos por atendimento`,
        expiresAt,
      },
      include: {
        client: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    return {
      id: transaction.id,
      clientId: transaction.clientId,
      appointmentId: transaction.appointmentId,
      type: transaction.type as LoyaltyTransactionType,
      points: transaction.points,
      description: transaction.description,
      expiresAt: transaction.expiresAt,
      createdAt: transaction.createdAt,
      client: transaction.client,
      appointment: transaction.appointment
        ? {
            id: transaction.appointment.id,
            date: transaction.appointment.date,
            service: transaction.appointment.service,
          }
        : undefined,
    };
  }

  // ============================================================================
  // CRIAR TRANSAÇÃO MANUAL
  // ============================================================================

  async createTransaction(
    tenantId: string,
    dto: CreateTransactionDto,
  ): Promise<LoyaltyTransactionResponse> {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const config = await this.getConfig(tenantId);

    // Calcular expiração para créditos
    let expiresAt: Date | null = null;
    if (
      dto.points > 0 &&
      (dto.type === LoyaltyTransactionType.EARNED ||
        dto.type === LoyaltyTransactionType.BONUS ||
        dto.type === LoyaltyTransactionType.ADJUSTMENT)
    ) {
      expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + config.expirationMonths);
    }

    const transaction = await this.prisma.loyaltyTransaction.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        appointmentId: dto.appointmentId,
        type: dto.type,
        points: dto.points,
        description: dto.description || `Transação manual: ${dto.type}`,
        expiresAt,
      },
      include: {
        client: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    return {
      id: transaction.id,
      clientId: transaction.clientId,
      appointmentId: transaction.appointmentId,
      type: transaction.type as LoyaltyTransactionType,
      points: transaction.points,
      description: transaction.description,
      expiresAt: transaction.expiresAt,
      createdAt: transaction.createdAt,
      client: transaction.client,
      appointment: transaction.appointment
        ? {
            id: transaction.appointment.id,
            date: transaction.appointment.date,
            service: transaction.appointment.service,
          }
        : undefined,
    };
  }

  // ============================================================================
  // RESGATAR PONTOS
  // ============================================================================

  async redeemPoints(
    tenantId: string,
    dto: CreateRedemptionDto,
  ): Promise<LoyaltyRedemptionResponse> {
    const config = await this.getConfig(tenantId);

    if (!config.isActive) {
      throw new BadRequestException('Programa de fidelidade está desativado');
    }

    if (dto.points < config.minimumRedemption) {
      throw new BadRequestException(
        `Mínimo de ${config.minimumRedemption} pontos para resgate`,
      );
    }

    const balance = await this.getClientBalance(tenantId, dto.clientId);

    if (balance.availableBalance < dto.points) {
      throw new BadRequestException(
        `Saldo insuficiente. Disponível: ${balance.availableBalance} pontos`,
      );
    }

    // Calcular valor do desconto
    // Fórmula: (pontos / 100) * valorResgate
    const discountValue = (dto.points / 100) * config.pointsRedemptionValue;

    const redemption = await this.prisma.loyaltyRedemption.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        pointsUsed: dto.points,
        discountValue,
        status: 'PENDING',
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return {
      id: redemption.id,
      clientId: redemption.clientId,
      appointmentId: redemption.appointmentId,
      pointsUsed: redemption.pointsUsed,
      discountValue: Number(redemption.discountValue),
      status: redemption.status as RedemptionStatus,
      createdAt: redemption.createdAt,
      usedAt: redemption.usedAt,
      client: redemption.client,
    };
  }

  // ============================================================================
  // APLICAR RESGATE (Usar o desconto em um agendamento)
  // ============================================================================

  async useRedemption(
    tenantId: string,
    redemptionId: string,
    appointmentId: string,
  ): Promise<LoyaltyRedemptionResponse> {
    const redemption = await this.prisma.loyaltyRedemption.findFirst({
      where: { id: redemptionId, tenantId },
    });

    if (!redemption) {
      throw new NotFoundException('Resgate não encontrado');
    }

    if (redemption.status !== 'PENDING') {
      throw new BadRequestException(
        `Resgate já foi ${redemption.status === 'USED' ? 'utilizado' : 'cancelado'}`,
      );
    }

    // Verificar se o agendamento existe
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Atualizar resgate
    const updated = await this.prisma.$transaction(async (tx) => {
      // Criar transação de débito
      await tx.loyaltyTransaction.create({
        data: {
          tenantId,
          clientId: redemption.clientId,
          appointmentId,
          type: 'REDEEMED',
          points: -redemption.pointsUsed,
          description: `Resgate aplicado`,
        },
      });

      // Atualizar status do resgate
      return tx.loyaltyRedemption.update({
        where: { id: redemptionId },
        data: {
          status: 'USED',
          appointmentId,
          usedAt: new Date(),
        },
        include: {
          client: { select: { id: true, name: true } },
        },
      });
    });

    return {
      id: updated.id,
      clientId: updated.clientId,
      appointmentId: updated.appointmentId,
      pointsUsed: updated.pointsUsed,
      discountValue: Number(updated.discountValue),
      status: updated.status as RedemptionStatus,
      createdAt: updated.createdAt,
      usedAt: updated.usedAt,
      client: updated.client,
    };
  }

  // ============================================================================
  // CANCELAR RESGATE
  // ============================================================================

  async cancelRedemption(
    tenantId: string,
    redemptionId: string,
  ): Promise<LoyaltyRedemptionResponse> {
    const redemption = await this.prisma.loyaltyRedemption.findFirst({
      where: { id: redemptionId, tenantId },
    });

    if (!redemption) {
      throw new NotFoundException('Resgate não encontrado');
    }

    if (redemption.status !== 'PENDING') {
      throw new BadRequestException(
        `Não é possível cancelar resgate ${redemption.status === 'USED' ? 'já utilizado' : 'já cancelado'}`,
      );
    }

    const updated = await this.prisma.loyaltyRedemption.update({
      where: { id: redemptionId },
      data: { status: 'CANCELLED' },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    return {
      id: updated.id,
      clientId: updated.clientId,
      appointmentId: updated.appointmentId,
      pointsUsed: updated.pointsUsed,
      discountValue: Number(updated.discountValue),
      status: updated.status as RedemptionStatus,
      createdAt: updated.createdAt,
      usedAt: updated.usedAt,
      client: updated.client,
    };
  }

  // ============================================================================
  // BUSCAR RESGATES
  // ============================================================================

  async getRedemptions(
    tenantId: string,
    query: QueryRedemptionsDto,
  ): Promise<{ data: LoyaltyRedemptionResponse[]; total: number }> {
    const where: any = { tenantId };

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const [redemptions, total] = await Promise.all([
      this.prisma.loyaltyRedemption.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit || 20,
        skip: query.offset || 0,
      }),
      this.prisma.loyaltyRedemption.count({ where }),
    ]);

    return {
      data: redemptions.map((r) => ({
        id: r.id,
        clientId: r.clientId,
        appointmentId: r.appointmentId,
        pointsUsed: r.pointsUsed,
        discountValue: Number(r.discountValue),
        status: r.status as RedemptionStatus,
        createdAt: r.createdAt,
        usedAt: r.usedAt,
        client: r.client,
      })),
      total,
    };
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getStats(tenantId: string): Promise<LoyaltyStatsResponse> {
    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { tenantId },
    });

    const now = new Date();
    let totalPointsIssued = 0;
    let totalPointsRedeemed = 0;
    let totalPointsExpired = 0;
    let totalActivePoints = 0;

    for (const t of transactions) {
      if (t.type === 'EARNED' || t.type === 'BONUS') {
        totalPointsIssued += t.points;
        if (t.expiresAt && t.expiresAt < now) {
          totalPointsExpired += t.points;
        } else {
          totalActivePoints += t.points;
        }
      } else if (t.type === 'REDEEMED') {
        totalPointsRedeemed += Math.abs(t.points);
        totalActivePoints += t.points;
      } else if (t.type === 'EXPIRED') {
        totalPointsExpired += Math.abs(t.points);
      } else if (t.type === 'ADJUSTMENT') {
        if (t.points > 0) {
          totalPointsIssued += t.points;
          totalActivePoints += t.points;
        } else {
          totalActivePoints += t.points;
        }
      }
    }

    // Clientes com pontos
    const clientsWithPoints = await this.prisma.loyaltyTransaction.groupBy({
      by: ['clientId'],
      where: { tenantId },
    });

    // Resgates pendentes
    const pendingRedemptions = await this.prisma.loyaltyRedemption.findMany({
      where: { tenantId, status: 'PENDING' },
    });

    const totalPendingRedemptions = pendingRedemptions.length;
    const totalPendingValue = pendingRedemptions.reduce(
      (sum, r) => sum + Number(r.discountValue),
      0,
    );

    const averagePointsPerClient =
      clientsWithPoints.length > 0
        ? Math.round(totalActivePoints / clientsWithPoints.length)
        : 0;

    return {
      totalPointsIssued,
      totalPointsRedeemed,
      totalPointsExpired,
      totalActivePoints: Math.max(0, totalActivePoints),
      totalClientsWithPoints: clientsWithPoints.length,
      totalPendingRedemptions,
      totalPendingValue,
      averagePointsPerClient,
    };
  }

  // ============================================================================
  // LEADERBOARD
  // ============================================================================

  async getLeaderboard(
    tenantId: string,
    limit = 10,
  ): Promise<LoyaltyLeaderboardEntry[]> {
    // Agrupa por cliente
    const clientPoints = await this.prisma.loyaltyTransaction.groupBy({
      by: ['clientId'],
      where: { tenantId },
      _sum: { points: true },
    });

    // Filtra clientes com saldo positivo
    const positiveBalances = clientPoints.filter(
      (c) => (c._sum.points || 0) > 0,
    );

    // Ordena por pontos
    positiveBalances.sort(
      (a, b) => (b._sum.points || 0) - (a._sum.points || 0),
    );

    // Limita
    const topClients = positiveBalances.slice(0, limit);

    // Busca dados dos clientes
    const clientIds = topClients.map((c) => c.clientId);
    const clients = await this.prisma.client.findMany({
      where: { id: { in: clientIds }, tenantId },
      select: { id: true, name: true, phone: true },
    });

    const clientMap = new Map(clients.map((c) => [c.id, c]));

    // Busca contagem de resgates
    const redemptionCounts = await this.prisma.loyaltyRedemption.groupBy({
      by: ['clientId'],
      where: { tenantId, clientId: { in: clientIds }, status: 'USED' },
      _count: true,
    });

    const redemptionMap = new Map(
      redemptionCounts.map((r) => [r.clientId, r._count]),
    );

    // Calcula totais earned para cada cliente
    const earnedTotals = await this.prisma.loyaltyTransaction.groupBy({
      by: ['clientId'],
      where: {
        tenantId,
        clientId: { in: clientIds },
        type: { in: ['EARNED', 'BONUS'] },
      },
      _sum: { points: true },
    });

    const earnedMap = new Map(
      earnedTotals.map((e) => [e.clientId, e._sum.points || 0]),
    );

    return topClients.map((cp) => {
      const client = clientMap.get(cp.clientId);
      return {
        clientId: cp.clientId,
        clientName: client?.name || 'Cliente',
        clientPhone: client?.phone || '',
        totalEarned: earnedMap.get(cp.clientId) || 0,
        currentBalance: cp._sum.points || 0,
        totalRedemptions: redemptionMap.get(cp.clientId) || 0,
      };
    });
  }

  // ============================================================================
  // LISTAR TODOS OS CLIENTES COM PONTOS
  // ============================================================================

  async getClientsWithPoints(
    tenantId: string,
    query: { search?: string; limit?: number; offset?: number },
  ): Promise<{ data: LoyaltyBalanceResponse[]; total: number }> {
    // Busca clientes com transações de fidelidade
    const clientsWithTransactions =
      await this.prisma.loyaltyTransaction.groupBy({
        by: ['clientId'],
        where: { tenantId },
      });

    const clientIds = clientsWithTransactions.map((c) => c.clientId);

    // Filtra clientes
    const whereClients: any = {
      id: { in: clientIds },
      tenantId,
      deletedAt: null,
    };

    if (query.search) {
      whereClients.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where: whereClients,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
        take: query.limit || 20,
        skip: query.offset || 0,
      }),
      this.prisma.client.count({ where: whereClients }),
    ]);

    // Busca saldo de cada cliente
    const balances = await Promise.all(
      clients.map((c) => this.getClientBalance(tenantId, c.id)),
    );

    return {
      data: balances,
      total,
    };
  }
}
