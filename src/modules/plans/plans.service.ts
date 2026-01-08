import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  PlanType,
  BillingCycle,
  SubscriptionStatus,
  Prisma,
} from '@prisma/client';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreatePlanLimitDto,
  UpdatePlanLimitDto,
  CreatePlanFeatureDto,
  UpdatePlanFeatureDto,
  CreateFullPlanDto,
  SubscribePlanDto,
  ChangePlanDto,
  CancelSubscriptionDto,
  QueryPlansDto,
  CheckLimitDto,
  CheckFeatureDto,
  LimitCheckResponseDto,
  FeatureCheckResponseDto,
  UsageResponseDto,
  PlanComparisonDto,
} from './dto';

@Injectable()
export class PlansService {
  private readonly CACHE_TTL = 3600; // 1 hora
  private readonly CACHE_PREFIX = 'plans:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================================
  // CRUD de Planos (Admin)
  // ============================================================================

  async createPlan(dto: CreatePlanDto) {
    // Verificar se já existe plano com esse código
    const existing = await this.prisma.plan.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Plano ${dto.code} já existe`);
    }

    const plan = await this.prisma.plan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice,
        yearlyPrice: dto.yearlyPrice,
        currency: dto.currency || 'BRL',
        trialDays: dto.trialDays || 0,
        displayOrder: dto.displayOrder || 0,
        isPopular: dto.isPopular || false,
        isActive: dto.isActive !== false,
        isPublic: dto.isPublic !== false,
      },
    });

    await this.invalidateCache();
    return plan;
  }

  async createFullPlan(dto: CreateFullPlanDto) {
    return this.prisma.$transaction(async (tx) => {
      // Criar plano
      const plan = await tx.plan.create({
        data: {
          code: dto.plan.code,
          name: dto.plan.name,
          description: dto.plan.description,
          monthlyPrice: dto.plan.monthlyPrice,
          yearlyPrice: dto.plan.yearlyPrice,
          currency: dto.plan.currency || 'BRL',
          trialDays: dto.plan.trialDays || 0,
          displayOrder: dto.plan.displayOrder || 0,
          isPopular: dto.plan.isPopular || false,
          isActive: dto.plan.isActive !== false,
          isPublic: dto.plan.isPublic !== false,
        },
      });

      // Criar limites
      if (dto.limits) {
        await tx.planLimit.create({
          data: {
            planId: plan.id,
            ...dto.limits,
          },
        });
      }

      // Criar features
      if (dto.features && dto.features.length > 0) {
        await tx.planFeature.createMany({
          data: dto.features.map((f, index) => ({
            planId: plan.id,
            featureCode: f.featureCode,
            displayName: f.displayName,
            isEnabled: f.isEnabled !== false,
            config: f.config || {},
            displayOrder: f.displayOrder ?? index,
          })),
        });
      }

      await this.invalidateCache();

      return this.findPlanById(plan.id);
    });
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    const updated = await this.prisma.plan.update({
      where: { id: planId },
      data: dto,
    });

    await this.invalidateCache();
    return updated;
  }

  async updatePlanLimits(planId: string, dto: UpdatePlanLimitDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    const limits = await this.prisma.planLimit.upsert({
      where: { planId },
      update: dto,
      create: {
        planId,
        ...dto,
      },
    });

    await this.invalidateCache();
    return limits;
  }

  async addPlanFeature(planId: string, dto: CreatePlanFeatureDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    const feature = await this.prisma.planFeature.create({
      data: {
        planId,
        featureCode: dto.featureCode,
        displayName: dto.displayName,
        isEnabled: dto.isEnabled !== false,
        config: dto.config || {},
        displayOrder: dto.displayOrder || 0,
      },
    });

    await this.invalidateCache();
    return feature;
  }

  async updatePlanFeature(featureId: string, dto: UpdatePlanFeatureDto) {
    const feature = await this.prisma.planFeature.update({
      where: { id: featureId },
      data: dto,
    });

    await this.invalidateCache();
    return feature;
  }

  async removePlanFeature(featureId: string) {
    await this.prisma.planFeature.delete({
      where: { id: featureId },
    });

    await this.invalidateCache();
    return { success: true };
  }

  // ============================================================================
  // Consulta de Planos
  // ============================================================================

  async findAllPlans(query: QueryPlansDto = {}) {
    const cacheKey = `${this.CACHE_PREFIX}all:${JSON.stringify(query)}`;

    // Tentar cache
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const where: Prisma.PlanWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.isPublic !== undefined) {
      where.isPublic = query.isPublic;
    }

    const plans = await this.prisma.plan.findMany({
      where,
      include: {
        limits: query.includeLimits !== false,
        features: query.includeFeatures !== false
          ? { orderBy: { displayOrder: 'asc' } }
          : false,
      },
      orderBy: { displayOrder: 'asc' },
    });

    // Cachear resultado
    await this.redis.set(cacheKey, JSON.stringify(plans), this.CACHE_TTL);

    return plans;
  }

  async findPlanById(planId: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: {
        limits: true,
        features: { orderBy: { displayOrder: 'asc' } },
      },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    return plan;
  }

  async findPlanByCode(code: PlanType) {
    const cacheKey = `${this.CACHE_PREFIX}code:${code}`;

    const cached = await this.redis.get<string>(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const plan = await this.prisma.plan.findUnique({
      where: { code },
      include: {
        limits: true,
        features: { orderBy: { displayOrder: 'asc' } },
      },
    });

    if (plan) {
      await this.redis.set(cacheKey, JSON.stringify(plan), this.CACHE_TTL);
    }

    return plan;
  }

  async getPublicPlans() {
    return this.findAllPlans({
      isActive: true,
      isPublic: true,
      includeFeatures: true,
      includeLimits: true,
    });
  }

  async comparePlans(): Promise<PlanComparisonDto> {
    const plans = await this.findAllPlans({
      isActive: true,
      isPublic: true,
      includeFeatures: true,
      includeLimits: true,
    });

    // Coletar todas as features únicas
    const allFeatures = new Map<string, string>();
    for (const plan of plans) {
      for (const feature of plan.features || []) {
        if (!allFeatures.has(feature.featureCode)) {
          allFeatures.set(feature.featureCode, feature.displayName);
        }
      }
    }

    // Montar comparativo de features
    const features = Array.from(allFeatures.entries()).map(([code, name]) => ({
      code,
      name,
      availability: plans.reduce((acc, plan) => {
        const hasFeature = (plan.features || []).some(
          (f) => f.featureCode === code && f.isEnabled,
        );
        acc[plan.code] = hasFeature;
        return acc;
      }, {} as { [key: string]: boolean }),
    }));

    // Montar comparativo de limites
    const limitNames = [
      { key: 'maxUsers', name: 'Usuários' },
      { key: 'maxProviders', name: 'Profissionais' },
      { key: 'maxClients', name: 'Clientes' },
      { key: 'maxAppointments', name: 'Agendamentos/mês' },
      { key: 'maxServices', name: 'Serviços' },
      { key: 'maxProducts', name: 'Produtos' },
      { key: 'storageGB', name: 'Armazenamento (GB)' },
    ];

    const limits = limitNames.map((limit) => ({
      name: limit.name,
      values: plans.reduce((acc, plan) => {
        const value = plan.limits?.[limit.key] ?? 0;
        acc[plan.code] = value === -1 ? 'Ilimitado' : value;
        return acc;
      }, {} as { [key: string]: number | string }),
    }));

    return { plans, features, limits };
  }

  // ============================================================================
  // Assinaturas
  // ============================================================================

  async getSubscription(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: {
          include: {
            limits: true,
            features: true,
          },
        },
      },
    });

    if (!subscription) {
      // Retornar plano FREE padrão
      return this.createDefaultFreeSubscription(tenantId);
    }

    return subscription;
  }

  async subscribeToPlan(tenantId: string, dto: SubscribePlanDto) {
    const plan = await this.findPlanByCode(dto.planCode);

    if (!plan) {
      throw new NotFoundException(`Plano ${dto.planCode} não encontrado`);
    }

    if (!plan.isActive) {
      throw new BadRequestException('Este plano não está disponível');
    }

    // Verificar se já tem assinatura
    const existing = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    const billingCycle = dto.billingCycle || BillingCycle.MONTHLY;
    const amount =
      billingCycle === BillingCycle.YEARLY
        ? plan.yearlyPrice
        : plan.monthlyPrice;

    // Calcular período
    const now = new Date();
    const periodEnd = this.calculatePeriodEnd(now, billingCycle);

    // Aplicar trial se disponível
    const hasTrialPlan = plan.trialDays > 0;
    const trialEnd = hasTrialPlan
      ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000)
      : null;

    const subscriptionData = {
      planId: plan.id,
      planType: plan.code,
      billingCycle,
      status: hasTrialPlan ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd || periodEnd,
      amount: new Prisma.Decimal(amount.toString()),
      couponCode: dto.couponCode,
      trialStart: hasTrialPlan ? now : null,
      trialEnd,
    };

    if (existing) {
      // Atualizar assinatura existente
      const subscription = await this.prisma.subscription.update({
        where: { tenantId },
        data: subscriptionData,
        include: { plan: { include: { limits: true, features: true } } },
      });

      // Atualizar plano do tenant
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: plan.code },
      });

      await this.invalidateTenantCache(tenantId);
      return subscription;
    }

    // Criar nova assinatura
    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId,
        ...subscriptionData,
      },
      include: { plan: { include: { limits: true, features: true } } },
    });

    // Atualizar plano do tenant
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: plan.code },
    });

    await this.invalidateTenantCache(tenantId);
    return subscription;
  }

  async changePlan(tenantId: string, dto: ChangePlanDto) {
    const subscription = await this.getSubscription(tenantId);
    const newPlan = await this.findPlanByCode(dto.newPlanCode);

    if (!newPlan) {
      throw new NotFoundException(`Plano ${dto.newPlanCode} não encontrado`);
    }

    if (!newPlan.isActive) {
      throw new BadRequestException('Este plano não está disponível');
    }

    // Verificar se é upgrade ou downgrade
    const currentPlanOrder = subscription.plan?.displayOrder ?? 0;
    const isUpgrade = newPlan.displayOrder > currentPlanOrder;

    if (dto.immediate || isUpgrade) {
      // Aplicar mudança imediatamente
      const billingCycle = dto.billingCycle || subscription.billingCycle;
      const amount =
        billingCycle === BillingCycle.YEARLY
          ? newPlan.yearlyPrice
          : newPlan.monthlyPrice;

      const updated = await this.prisma.subscription.update({
        where: { tenantId },
        data: {
          planId: newPlan.id,
          planType: newPlan.code,
          billingCycle,
          amount: new Prisma.Decimal(amount.toString()),
          scheduledPlanId: null,
          scheduledChange: null,
        },
        include: { plan: { include: { limits: true, features: true } } },
      });

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: newPlan.code },
      });

      await this.invalidateTenantCache(tenantId);
      return updated;
    }

    // Agendar mudança para o fim do período
    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        scheduledPlanId: newPlan.id,
        scheduledChange: subscription.currentPeriodEnd,
      },
      include: { plan: { include: { limits: true, features: true } } },
    });

    return updated;
  }

  async cancelSubscription(tenantId: string, dto: CancelSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    if (dto.immediate) {
      // Cancelar imediatamente e voltar para FREE
      const freePlan = await this.findPlanByCode(PlanType.FREE);

      const updated = await this.prisma.subscription.update({
        where: { tenantId },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: dto.reason,
          planId: freePlan?.id,
          planType: PlanType.FREE,
          amount: new Prisma.Decimal('0'),
        },
      });

      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: PlanType.FREE },
      });

      await this.invalidateTenantCache(tenantId);
      return updated;
    }

    // Marcar para cancelar no fim do período
    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        cancelAtPeriodEnd: true,
        cancelReason: dto.reason,
      },
    });

    return updated;
  }

  async reactivateSubscription(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    if (subscription.status !== SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Assinatura não está cancelada');
    }

    const updated = await this.prisma.subscription.update({
      where: { tenantId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        cancelReason: null,
      },
    });

    await this.invalidateTenantCache(tenantId);
    return updated;
  }

  // ============================================================================
  // Verificação de Limites e Features
  // ============================================================================

  async checkLimit(
    tenantId: string,
    dto: CheckLimitDto,
  ): Promise<LimitCheckResponseDto> {
    const subscription = await this.getSubscription(tenantId);
    const limits = subscription.plan?.limits;

    if (!limits) {
      return {
        allowed: true,
        resource: dto.resource,
        current: 0,
        limit: -1,
        remaining: -1,
      };
    }

    // Mapear recurso para campo de limite
    const limitMap: { [key: string]: string } = {
      users: 'maxUsers',
      providers: 'maxProviders',
      clients: 'maxClients',
      appointments: 'maxAppointments',
      services: 'maxServices',
      products: 'maxProducts',
      campaigns: 'maxCampaigns',
      webhooks: 'maxWebhooks',
      templates: 'maxTemplates',
    };

    const limitField = limitMap[dto.resource];
    if (!limitField) {
      throw new BadRequestException(`Recurso desconhecido: ${dto.resource}`);
    }

    const limit = limits[limitField];

    // -1 = ilimitado
    if (limit === -1) {
      return {
        allowed: true,
        resource: dto.resource,
        current: 0,
        limit: -1,
        remaining: -1,
      };
    }

    // Obter uso atual
    const current = await this.getCurrentUsage(tenantId, dto.resource);
    const quantity = dto.quantity || 1;
    const newTotal = current + quantity;

    return {
      allowed: newTotal <= limit,
      resource: dto.resource,
      current,
      limit,
      remaining: Math.max(0, limit - current),
      message: newTotal > limit
        ? `Limite de ${dto.resource} atingido (${current}/${limit})`
        : undefined,
    };
  }

  async checkFeature(
    tenantId: string,
    dto: CheckFeatureDto,
  ): Promise<FeatureCheckResponseDto> {
    const subscription = await this.getSubscription(tenantId);
    const features = subscription.plan?.features || [];

    const feature = features.find((f) => f.featureCode === dto.featureCode);

    if (!feature) {
      return {
        allowed: false,
        featureCode: dto.featureCode,
        message: `Funcionalidade ${dto.featureCode} não disponível no seu plano`,
      };
    }

    return {
      allowed: feature.isEnabled,
      featureCode: dto.featureCode,
      message: !feature.isEnabled
        ? `Funcionalidade ${dto.featureCode} não está habilitada no seu plano`
        : undefined,
    };
  }

  async hasFeature(tenantId: string, featureCode: string): Promise<boolean> {
    const result = await this.checkFeature(tenantId, { featureCode });
    return result.allowed;
  }

  async canAddResource(
    tenantId: string,
    resource: string,
    quantity = 1,
  ): Promise<boolean> {
    const result = await this.checkLimit(tenantId, { resource, quantity });
    return result.allowed;
  }

  async getAllUsage(tenantId: string): Promise<UsageResponseDto[]> {
    const subscription = await this.getSubscription(tenantId);
    const limits = subscription.plan?.limits;

    if (!limits) {
      return [];
    }

    const resources = [
      { resource: 'users', limitField: 'maxUsers' },
      { resource: 'providers', limitField: 'maxProviders' },
      { resource: 'clients', limitField: 'maxClients' },
      { resource: 'appointments', limitField: 'maxAppointments' },
      { resource: 'services', limitField: 'maxServices' },
      { resource: 'products', limitField: 'maxProducts' },
      { resource: 'campaigns', limitField: 'maxCampaigns' },
      { resource: 'webhooks', limitField: 'maxWebhooks' },
    ];

    const usage: UsageResponseDto[] = [];

    for (const r of resources) {
      const current = await this.getCurrentUsage(tenantId, r.resource);
      const limit = limits[r.limitField];

      usage.push({
        resource: r.resource,
        current,
        limit,
        percentage: limit === -1 ? 0 : Math.round((current / limit) * 100),
        isAtLimit: limit !== -1 && current >= limit,
      });
    }

    return usage;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async getCurrentUsage(
    tenantId: string,
    resource: string,
  ): Promise<number> {
    const countMap: { [key: string]: () => Promise<number> } = {
      users: () =>
        this.prisma.user.count({ where: { tenantId, isActive: true } }),
      providers: () =>
        this.prisma.provider.count({
          where: { tenantId, deletedAt: null, active: true },
        }),
      clients: () =>
        this.prisma.client.count({ where: { tenantId, deletedAt: null } }),
      appointments: async () => {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        return this.prisma.appointment.count({
          where: {
            tenantId,
            createdAt: { gte: startOfMonth },
          },
        });
      },
      services: () =>
        this.prisma.service.count({
          where: { tenantId, deletedAt: null, active: true },
        }),
      products: () =>
        this.prisma.product.count({
          where: { tenantId, deletedAt: null, isActive: true },
        }),
      campaigns: () =>
        this.prisma.marketingCampaign.count({
          where: { tenantId, isActive: true },
        }),
      webhooks: () =>
        this.prisma.webhookEndpoint.count({
          where: { tenantId, isActive: true },
        }),
    };

    const countFn = countMap[resource];
    if (!countFn) {
      return 0;
    }

    return countFn();
  }

  private calculatePeriodEnd(start: Date, cycle: BillingCycle): Date {
    const end = new Date(start);

    switch (cycle) {
      case BillingCycle.MONTHLY:
        end.setMonth(end.getMonth() + 1);
        break;
      case BillingCycle.QUARTERLY:
        end.setMonth(end.getMonth() + 3);
        break;
      case BillingCycle.YEARLY:
        end.setFullYear(end.getFullYear() + 1);
        break;
    }

    return end;
  }

  private async createDefaultFreeSubscription(tenantId: string) {
    const freePlan = await this.findPlanByCode(PlanType.FREE);

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 100); // Sem fim

    return this.prisma.subscription.create({
      data: {
        tenantId,
        planId: freePlan?.id,
        planType: PlanType.FREE,
        billingCycle: BillingCycle.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        amount: new Prisma.Decimal('0'),
      },
      include: {
        plan: {
          include: {
            limits: true,
            features: true,
          },
        },
      },
    });
  }

  private async invalidateCache() {
    await this.redis.delByPattern(`${this.CACHE_PREFIX}*`);
  }

  private async invalidateTenantCache(tenantId: string) {
    await this.redis.del(`${this.CACHE_PREFIX}tenant:${tenantId}`);
  }

  // ============================================================================
  // Seed de Planos Padrão
  // ============================================================================

  async seedDefaultPlans() {
    const plans = [
      {
        code: PlanType.FREE,
        name: 'Free',
        description: 'Para começar a explorar o Belu',
        monthlyPrice: 0,
        yearlyPrice: 0,
        trialDays: 0,
        displayOrder: 0,
        isPopular: false,
        limits: {
          maxUsers: 1,
          maxProviders: 1,
          maxClients: 50,
          maxAppointments: 50,
          maxServices: 5,
          maxProducts: 10,
          storageGB: 1,
          maxCampaigns: 0,
          maxWebhooks: 0,
          maxTemplates: 3,
          dataRetentionDays: 90,
        },
        features: [
          { featureCode: 'APPOINTMENTS', displayName: 'Agendamentos' },
          { featureCode: 'CLIENTS', displayName: 'Gestão de Clientes' },
          { featureCode: 'SERVICES', displayName: 'Gestão de Serviços' },
          { featureCode: 'PUBLIC_PAGE', displayName: 'Página Pública' },
        ],
      },
      {
        code: PlanType.STARTER,
        name: 'Starter',
        description: 'Para profissionais autônomos',
        monthlyPrice: 97,
        yearlyPrice: 970, // ~2 meses grátis
        trialDays: 14,
        displayOrder: 1,
        isPopular: false,
        limits: {
          maxUsers: 2,
          maxProviders: 2,
          maxClients: 300,
          maxAppointments: 300,
          maxServices: 20,
          maxProducts: 50,
          storageGB: 5,
          maxCampaigns: 2,
          maxWebhooks: 2,
          maxTemplates: 10,
          dataRetentionDays: 365,
        },
        features: [
          { featureCode: 'APPOINTMENTS', displayName: 'Agendamentos' },
          { featureCode: 'CLIENTS', displayName: 'Gestão de Clientes' },
          { featureCode: 'SERVICES', displayName: 'Gestão de Serviços' },
          { featureCode: 'PROVIDERS', displayName: 'Gestão de Profissionais' },
          { featureCode: 'FINANCIAL_BASIC', displayName: 'Financeiro Básico' },
          { featureCode: 'MEDICAL_RECORDS', displayName: 'Prontuários' },
          { featureCode: 'INVENTORY', displayName: 'Estoque' },
          { featureCode: 'LEADS', displayName: 'CRM de Leads' },
          { featureCode: 'WHATSAPP', displayName: 'Notificações WhatsApp' },
          { featureCode: 'PUBLIC_PAGE', displayName: 'Página Pública' },
        ],
      },
      {
        code: PlanType.PROFESSIONAL,
        name: 'Professional',
        description: 'Para clínicas em crescimento',
        monthlyPrice: 197,
        yearlyPrice: 1970, // ~2 meses grátis
        trialDays: 14,
        displayOrder: 2,
        isPopular: true,
        limits: {
          maxUsers: 5,
          maxProviders: 10,
          maxClients: -1, // Ilimitado
          maxAppointments: -1,
          maxServices: -1,
          maxProducts: -1,
          storageGB: 20,
          maxCampaigns: 10,
          maxWebhooks: 10,
          maxTemplates: -1,
          dataRetentionDays: -1, // Sem limite
        },
        features: [
          { featureCode: 'APPOINTMENTS', displayName: 'Agendamentos' },
          { featureCode: 'CLIENTS', displayName: 'Gestão de Clientes' },
          { featureCode: 'SERVICES', displayName: 'Gestão de Serviços' },
          { featureCode: 'PROVIDERS', displayName: 'Gestão de Profissionais' },
          { featureCode: 'FINANCIAL_BASIC', displayName: 'Financeiro Básico' },
          { featureCode: 'FINANCIAL_REPORTS', displayName: 'Relatórios Financeiros' },
          { featureCode: 'FINANCIAL_COMMISSIONS', displayName: 'Sistema de Comissões' },
          { featureCode: 'MEDICAL_RECORDS', displayName: 'Prontuários' },
          { featureCode: 'ANAMNESIS_TEMPLATES', displayName: 'Templates de Anamnese' },
          { featureCode: 'INVENTORY', displayName: 'Estoque' },
          { featureCode: 'AUTO_STOCK_DEDUCTION', displayName: 'Dedução Automática de Estoque' },
          { featureCode: 'LEADS', displayName: 'CRM de Leads' },
          { featureCode: 'LEADS_PIPELINE', displayName: 'Pipeline Visual' },
          { featureCode: 'MARKETING_CAMPAIGNS', displayName: 'Campanhas de Marketing' },
          { featureCode: 'WHATSAPP', displayName: 'Notificações WhatsApp' },
          { featureCode: 'GOOGLE_CALENDAR', displayName: 'Google Calendar' },
          { featureCode: 'WEBHOOKS', displayName: 'Webhooks para Leads' },
          { featureCode: 'PUBLIC_PAGE', displayName: 'Página Pública' },
          { featureCode: 'PAGE_BUILDER', displayName: 'Editor de Página' },
        ],
      },
      {
        code: PlanType.ENTERPRISE,
        name: 'Enterprise',
        description: 'Para redes de clínicas',
        monthlyPrice: 497,
        yearlyPrice: 4970,
        trialDays: 14,
        displayOrder: 3,
        isPopular: false,
        limits: {
          maxUsers: -1,
          maxProviders: -1,
          maxClients: -1,
          maxAppointments: -1,
          maxServices: -1,
          maxProducts: -1,
          storageGB: -1,
          maxCampaigns: -1,
          maxWebhooks: -1,
          maxTemplates: -1,
          dataRetentionDays: -1,
        },
        features: [
          { featureCode: 'APPOINTMENTS', displayName: 'Agendamentos' },
          { featureCode: 'CLIENTS', displayName: 'Gestão de Clientes' },
          { featureCode: 'SERVICES', displayName: 'Gestão de Serviços' },
          { featureCode: 'PROVIDERS', displayName: 'Gestão de Profissionais' },
          { featureCode: 'FINANCIAL_BASIC', displayName: 'Financeiro Básico' },
          { featureCode: 'FINANCIAL_REPORTS', displayName: 'Relatórios Financeiros' },
          { featureCode: 'FINANCIAL_COMMISSIONS', displayName: 'Sistema de Comissões' },
          { featureCode: 'MEDICAL_RECORDS', displayName: 'Prontuários' },
          { featureCode: 'ANAMNESIS_TEMPLATES', displayName: 'Templates de Anamnese' },
          { featureCode: 'DIGITAL_SIGNATURE', displayName: 'Assinatura Digital' },
          { featureCode: 'INVENTORY', displayName: 'Estoque' },
          { featureCode: 'AUTO_STOCK_DEDUCTION', displayName: 'Dedução Automática de Estoque' },
          { featureCode: 'LEADS', displayName: 'CRM de Leads' },
          { featureCode: 'LEADS_PIPELINE', displayName: 'Pipeline Visual' },
          { featureCode: 'LEADS_AUTOMATION', displayName: 'Automações de Leads' },
          { featureCode: 'MARKETING_CAMPAIGNS', displayName: 'Campanhas de Marketing' },
          { featureCode: 'MARKETING_DASHBOARD', displayName: 'Dashboard de Marketing' },
          { featureCode: 'SOCIAL_POSTS', displayName: 'Agendamento de Posts' },
          { featureCode: 'WHATSAPP', displayName: 'Notificações WhatsApp' },
          { featureCode: 'WHATSAPP_BULK', displayName: 'WhatsApp em Massa' },
          { featureCode: 'GOOGLE_CALENDAR', displayName: 'Google Calendar' },
          { featureCode: 'WEBHOOKS', displayName: 'Webhooks para Leads' },
          { featureCode: 'PUBLIC_PAGE', displayName: 'Página Pública' },
          { featureCode: 'PAGE_BUILDER', displayName: 'Editor de Página' },
          { featureCode: 'CUSTOM_DOMAIN', displayName: 'Domínio Customizado' },
          { featureCode: 'API_ACCESS', displayName: 'Acesso à API' },
          { featureCode: 'PRIORITY_SUPPORT', displayName: 'Suporte Prioritário' },
          { featureCode: 'MULTI_LOCATION', displayName: 'Múltiplas Unidades' },
        ],
      },
    ];

    for (const planData of plans) {
      const { limits, features, ...plan } = planData;

      await this.prisma.plan.upsert({
        where: { code: plan.code },
        update: plan,
        create: plan,
      });

      const dbPlan = await this.prisma.plan.findUnique({
        where: { code: plan.code },
      });

      if (dbPlan) {
        // Upsert limites
        await this.prisma.planLimit.upsert({
          where: { planId: dbPlan.id },
          update: limits,
          create: { planId: dbPlan.id, ...limits },
        });

        // Deletar features antigas e criar novas
        await this.prisma.planFeature.deleteMany({
          where: { planId: dbPlan.id },
        });

        await this.prisma.planFeature.createMany({
          data: features.map((f, index) => ({
            planId: dbPlan.id,
            featureCode: f.featureCode,
            displayName: f.displayName,
            isEnabled: true,
            displayOrder: index,
          })),
        });
      }
    }

    await this.invalidateCache();
    return { success: true, message: 'Planos criados/atualizados com sucesso' };
  }
}
