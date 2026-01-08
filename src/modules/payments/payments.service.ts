import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  ConfigureGatewayDto,
  UpdateGatewayConfigDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CancelSubscriptionDto,
  CreatePaymentDto,
  RefundPaymentDto,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  CheckoutDto,
  QueryPaymentsDto,
  QueryInvoicesDto,
  PlanPricingDto,
} from './dto';
import {
  PaymentGatewayProvider,
  PlanType,
  PaymentType,
  PaymentStatus,
  SubscriptionStatus,
  InvoiceStatus,
  Prisma,
} from '@prisma/client';
import { PLAN_LIMITS } from '../../common/permissions/permissions';

@Injectable()
export class PaymentsService {
  private readonly CACHE_PREFIX = 'payments';
  private readonly CACHE_TTL = 300;

  // Preços dos planos (em centavos)
  private readonly PLAN_PRICES: Record<PlanType, { monthly: number; yearly: number }> = {
    [PlanType.FREE]: { monthly: 0, yearly: 0 },
    [PlanType.STARTER]: { monthly: 9900, yearly: 99900 }, // R$99/mês ou R$999/ano
    [PlanType.PROFESSIONAL]: { monthly: 19900, yearly: 199900 }, // R$199/mês ou R$1999/ano
    [PlanType.ENTERPRISE]: { monthly: 49900, yearly: 499900 }, // R$499/mês ou R$4999/ano
  };

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  // ============================================================================
  // GATEWAY CONFIG
  // ============================================================================

  async getGatewayConfig(tenantId: string) {
    const config = await this.prisma.paymentGatewayConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      return null;
    }

    // Esconder credenciais sensíveis
    return {
      ...config,
      publicKey: config.publicKey ? '********' : null,
      secretKey: config.secretKey ? '********' : null,
      webhookSecret: config.webhookSecret ? '********' : null,
    };
  }

  async configureGateway(tenantId: string, dto: ConfigureGatewayDto) {
    const existing = await this.prisma.paymentGatewayConfig.findUnique({
      where: { tenantId },
    });

    if (existing) {
      return this.prisma.paymentGatewayConfig.update({
        where: { tenantId },
        data: dto,
      });
    }

    return this.prisma.paymentGatewayConfig.create({
      data: {
        tenantId,
        ...dto,
      },
    });
  }

  async updateGatewayConfig(tenantId: string, dto: UpdateGatewayConfigDto) {
    const existing = await this.prisma.paymentGatewayConfig.findUnique({
      where: { tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Configuração de gateway não encontrada');
    }

    return this.prisma.paymentGatewayConfig.update({
      where: { tenantId },
      data: dto,
    });
  }

  // ============================================================================
  // PLAN PRICING
  // ============================================================================

  getPlanPricing(): PlanPricingDto[] {
    return Object.entries(PLAN_LIMITS).map(([planType, limits]) => ({
      planType: planType as PlanType,
      name: this.getPlanName(planType as PlanType),
      monthlyPrice: this.PLAN_PRICES[planType as PlanType].monthly / 100,
      yearlyPrice: this.PLAN_PRICES[planType as PlanType].yearly / 100,
      features: limits.features,
      limits: {
        maxUsers: limits.maxUsers,
        maxClients: limits.maxClients,
        maxProviders: limits.maxProviders,
        maxStorageMB: limits.maxStorageMB,
      },
    }));
  }

  private getPlanName(planType: PlanType): string {
    const names: Record<PlanType, string> = {
      [PlanType.FREE]: 'Gratuito',
      [PlanType.STARTER]: 'Starter',
      [PlanType.PROFESSIONAL]: 'Professional',
      [PlanType.ENTERPRISE]: 'Enterprise',
    };
    return names[planType];
  }

  // ============================================================================
  // SUBSCRIPTION
  // ============================================================================

  async getSubscription(tenantId: string) {
    return this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        payments: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
        invoices: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async createSubscription(tenantId: string, dto: CreateSubscriptionDto) {
    // Verificar se já existe assinatura
    const existing = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (existing && existing.status === SubscriptionStatus.ACTIVE) {
      throw new BadRequestException('Já existe uma assinatura ativa');
    }

    // Buscar configuração do gateway
    const gatewayConfig = await this.prisma.paymentGatewayConfig.findUnique({
      where: { tenantId },
    });

    if (!gatewayConfig || !gatewayConfig.isActive) {
      throw new BadRequestException('Gateway de pagamento não configurado');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const amount = this.PLAN_PRICES[dto.planType].monthly;

    // Se for trial
    let trialStart: Date | null = null;
    let trialEnd: Date | null = null;
    let status: SubscriptionStatus = SubscriptionStatus.ACTIVE;

    if (dto.startTrial && dto.planType !== PlanType.FREE) {
      trialStart = now;
      trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 14); // 14 dias de trial
      status = SubscriptionStatus.TRIALING;
    }

    // Criar assinatura no banco
    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId,
        planType: dto.planType,
        status,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        amount: amount / 100,
        trialStart,
        trialEnd,
      },
    });

    // Atualizar plano do tenant
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { plan: dto.planType },
    });

    // Se não for trial e não for plano gratuito, criar pagamento
    if (!dto.startTrial && dto.planType !== PlanType.FREE) {
      await this.createPaymentForSubscription(
        tenantId,
        subscription.id,
        amount,
        dto.paymentMethod,
        dto.cardToken,
      );
    }

    return subscription;
  }

  async updateSubscription(tenantId: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    const updateData: Prisma.SubscriptionUpdateInput = {};

    if (dto.planType) {
      updateData.planType = dto.planType;
      updateData.amount = this.PLAN_PRICES[dto.planType].monthly / 100;

      // Atualizar plano do tenant
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: dto.planType },
      });
    }

    if (dto.cancelAtPeriodEnd !== undefined) {
      updateData.cancelAtPeriodEnd = dto.cancelAtPeriodEnd;
    }

    return this.prisma.subscription.update({
      where: { tenantId },
      data: updateData,
    });
  }

  async cancelSubscription(tenantId: string, dto: CancelSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    if (dto.immediate) {
      // Cancelar imediatamente
      await this.prisma.subscription.update({
        where: { tenantId },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      // Voltar para plano gratuito
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { plan: PlanType.FREE },
      });
    } else {
      // Cancelar no fim do período
      await this.prisma.subscription.update({
        where: { tenantId },
        data: {
          cancelAtPeriodEnd: true,
        },
      });
    }

    return { message: 'Assinatura cancelada com sucesso' };
  }

  async reactivateSubscription(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException(
        'Assinatura já cancelada. Crie uma nova assinatura.',
      );
    }

    return this.prisma.subscription.update({
      where: { tenantId },
      data: {
        cancelAtPeriodEnd: false,
      },
    });
  }

  // ============================================================================
  // PAYMENTS
  // ============================================================================

  async findAllPayments(tenantId: string, query?: QueryPaymentsDto) {
    const where: Prisma.PaymentWhereInput = { tenantId };

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.paymentMethod) {
      where.paymentMethod = query.paymentMethod;
    }

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: { id: true, invoiceNumber: true },
          },
          subscription: {
            select: { id: true, planType: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findPaymentById(id: string, tenantId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, tenantId },
      include: {
        invoice: true,
        subscription: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    return payment;
  }

  async createPayment(tenantId: string, dto: CreatePaymentDto) {
    // Buscar configuração do gateway
    const gatewayConfig = await this.prisma.paymentGatewayConfig.findUnique({
      where: { tenantId },
    });

    if (!gatewayConfig || !gatewayConfig.isActive) {
      throw new BadRequestException('Gateway de pagamento não configurado');
    }

    // Criar pagamento no banco
    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        invoiceId: dto.invoiceId,
        status: PaymentStatus.PENDING,
        metadata: dto.metadata,
      },
    });

    // Processar pagamento baseado no método
    try {
      const result = await this.processPayment(
        gatewayConfig,
        payment,
        dto,
      );
      return result;
    } catch (error) {
      // Atualizar status para falhou
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureMessage: error.message,
        },
      });
      throw error;
    }
  }

  async refundPayment(id: string, tenantId: string, dto: RefundPaymentDto) {
    const payment = await this.findPaymentById(id, tenantId);

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException('Pagamento não pode ser reembolsado');
    }

    const refundAmount = dto.amount || Number(payment.amount);

    if (refundAmount > Number(payment.amount)) {
      throw new BadRequestException(
        'Valor do reembolso maior que o valor do pagamento',
      );
    }

    // TODO: Implementar reembolso real no gateway

    const isPartialRefund = refundAmount < Number(payment.amount);

    return this.prisma.payment.update({
      where: { id },
      data: {
        status: isPartialRefund
          ? PaymentStatus.PARTIALLY_REFUNDED
          : PaymentStatus.REFUNDED,
        refundedAmount: refundAmount,
        refundedAt: new Date(),
        refundReason: dto.reason,
      },
    });
  }

  private async createPaymentForSubscription(
    tenantId: string,
    subscriptionId: string,
    amount: number,
    paymentMethod: PaymentType,
    cardToken?: string,
  ) {
    return this.prisma.payment.create({
      data: {
        tenantId,
        subscriptionId,
        amount: amount / 100,
        paymentMethod,
        status: PaymentStatus.PENDING,
      },
    });
  }

  private async processPayment(
    gatewayConfig: { provider: PaymentGatewayProvider; secretKey: string | null },
    payment: { id: string; amount: any; paymentMethod: PaymentType },
    dto: CreatePaymentDto,
  ) {
    // TODO: Implementar integração real com gateways

    switch (gatewayConfig.provider) {
      case PaymentGatewayProvider.STRIPE:
        return this.processStripePayment(payment, dto);
      case PaymentGatewayProvider.MERCADO_PAGO:
        return this.processMercadoPagoPayment(payment, dto);
      default:
        throw new BadRequestException(`Provedor ${gatewayConfig.provider} não suportado`);
    }
  }

  private async processStripePayment(
    payment: { id: string; amount: any; paymentMethod: PaymentType },
    dto: CreatePaymentDto,
  ) {
    // TODO: Implementar Stripe
    // Esta é uma implementação de exemplo

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PROCESSING,
      },
    });

    if (dto.paymentMethod === PaymentType.PIX) {
      // Gerar código PIX
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          pixCode: `PIX_CODE_${payment.id}`,
          pixQrCode: 'BASE64_QR_CODE_HERE',
          pixExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
        },
      });
    }

    if (dto.paymentMethod === PaymentType.BOLETO) {
      // Gerar boleto
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          boletoCode: `23793.38128 60000.000003 00000.000408 1 84340000012345`,
          boletoPdfUrl: `https://example.com/boleto/${payment.id}.pdf`,
          boletoExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 dias
        },
      });
    }

    // Cartão de crédito - processamento direto
    return this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        paidAt: new Date(),
        cardBrand: 'visa',
        cardLast4: '4242',
      },
    });
  }

  private async processMercadoPagoPayment(
    payment: { id: string; amount: any; paymentMethod: PaymentType },
    dto: CreatePaymentDto,
  ) {
    // TODO: Implementar Mercado Pago
    console.log(`[Mercado Pago] Processando pagamento ${payment.id}`);

    return this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PROCESSING,
      },
    });
  }

  // ============================================================================
  // INVOICES
  // ============================================================================

  async findAllInvoices(tenantId: string, query?: QueryInvoicesDto) {
    const where: Prisma.InvoiceWhereInput = { tenantId };

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          subscription: {
            select: { id: true, planType: true },
          },
          payments: {
            select: { id: true, status: true, amount: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findInvoiceById(id: string, tenantId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        subscription: true,
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Fatura não encontrada');
    }

    return invoice;
  }

  async createInvoice(tenantId: string, dto: CreateInvoiceDto) {
    const total = dto.subtotal - (dto.discount || 0) + (dto.tax || 0);

    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    return this.prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        subtotal: dto.subtotal,
        discount: dto.discount,
        tax: dto.tax,
        total,
        dueDate: new Date(dto.dueDate),
        description: dto.description,
        lineItems: dto.lineItems as any,
        status: InvoiceStatus.OPEN,
      },
    });
  }

  async updateInvoice(id: string, tenantId: string, dto: UpdateInvoiceDto) {
    const invoice = await this.findInvoiceById(id, tenantId);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Fatura já paga não pode ser editada');
    }

    const updateData: Prisma.InvoiceUpdateInput = { ...dto };

    if (dto.subtotal || dto.discount || dto.tax) {
      const subtotal = dto.subtotal ?? Number(invoice.subtotal);
      const discount = dto.discount ?? Number(invoice.discount || 0);
      const tax = dto.tax ?? Number(invoice.tax || 0);
      updateData.total = subtotal - discount + tax;
    }

    if (dto.dueDate) {
      updateData.dueDate = new Date(dto.dueDate);
    }

    return this.prisma.invoice.update({
      where: { id },
      data: updateData,
    });
  }

  async voidInvoice(id: string, tenantId: string) {
    const invoice = await this.findInvoiceById(id, tenantId);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Fatura já paga não pode ser anulada');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.VOID },
    });
  }

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.invoice.count({
      where: { tenantId },
    });

    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  // ============================================================================
  // CHECKOUT (Fluxo completo)
  // ============================================================================

  async checkout(tenantId: string, dto: CheckoutDto) {
    // 1. Criar ou atualizar assinatura
    const subscription = await this.createSubscription(tenantId, {
      planType: dto.planType,
      paymentMethod: dto.paymentMethod,
      cardToken: dto.cardToken,
      cardHolderName: dto.cardHolderName,
      couponCode: dto.couponCode,
    });

    // 2. Criar fatura
    const amount = this.PLAN_PRICES[dto.planType].monthly / 100;
    const invoice = await this.createInvoice(tenantId, {
      subtotal: amount,
      dueDate: new Date().toISOString(),
      description: `Assinatura ${this.getPlanName(dto.planType)} - Mensal`,
    });

    // 3. Atualizar assinatura com fatura
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { subscriptionId: subscription.id },
    });

    // 4. Criar pagamento
    const payment = await this.createPayment(tenantId, {
      amount,
      paymentMethod: dto.paymentMethod,
      cardToken: dto.cardToken,
      invoiceId: invoice.id,
    });

    return {
      subscription,
      invoice,
      payment,
    };
  }

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  async handleStripeWebhook(payload: any, signature: string) {
    // TODO: Verificar assinatura do webhook
    // TODO: Processar eventos do Stripe

    const event = payload;

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
    }

    return { received: true };
  }

  async handleMercadoPagoWebhook(payload: any) {
    // TODO: Processar eventos do Mercado Pago

    const action = payload.action;
    const type = payload.type;

    if (type === 'payment') {
      // Buscar detalhes do pagamento na API do Mercado Pago
      // Atualizar status no banco
    }

    return { received: true };
  }

  private async handlePaymentSucceeded(paymentIntent: any) {
    const payment = await this.prisma.payment.findFirst({
      where: { externalId: paymentIntent.id },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          paidAt: new Date(),
        },
      });

      // Atualizar fatura se houver
      if (payment.invoiceId) {
        await this.prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            status: InvoiceStatus.PAID,
            paidAt: new Date(),
          },
        });
      }
    }
  }

  private async handlePaymentFailed(paymentIntent: any) {
    const payment = await this.prisma.payment.findFirst({
      where: { externalId: paymentIntent.id },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureCode: paymentIntent.last_payment_error?.code,
          failureMessage: paymentIntent.last_payment_error?.message,
        },
      });
    }
  }

  private async handleInvoicePaid(invoice: any) {
    const dbInvoice = await this.prisma.invoice.findFirst({
      where: { externalId: invoice.id },
    });

    if (dbInvoice) {
      await this.prisma.invoice.update({
        where: { id: dbInvoice.id },
        data: {
          status: InvoiceStatus.PAID,
          paidAt: new Date(),
        },
      });
    }
  }

  private async handleSubscriptionUpdated(subscription: any) {
    const dbSubscription = await this.prisma.subscription.findFirst({
      where: { externalId: subscription.id },
    });

    if (dbSubscription) {
      const statusMap: Record<string, SubscriptionStatus> = {
        active: SubscriptionStatus.ACTIVE,
        past_due: SubscriptionStatus.PAST_DUE,
        canceled: SubscriptionStatus.CANCELLED,
        unpaid: SubscriptionStatus.UNPAID,
        trialing: SubscriptionStatus.TRIALING,
        paused: SubscriptionStatus.PAUSED,
      };

      await this.prisma.subscription.update({
        where: { id: dbSubscription.id },
        data: {
          status: statusMap[subscription.status] || SubscriptionStatus.ACTIVE,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      });
    }
  }

  private async handleSubscriptionDeleted(subscription: any) {
    const dbSubscription = await this.prisma.subscription.findFirst({
      where: { externalId: subscription.id },
    });

    if (dbSubscription) {
      await this.prisma.subscription.update({
        where: { id: dbSubscription.id },
        data: {
          status: SubscriptionStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      // Voltar para plano gratuito
      await this.prisma.tenant.update({
        where: { id: dbSubscription.tenantId },
        data: { plan: PlanType.FREE },
      });
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  async getPaymentStats(tenantId: string, startDate?: string, endDate?: string) {
    const where: Prisma.PaymentWhereInput = { tenantId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
      }
    }

    const [total, byStatus, byMethod, revenue] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['paymentMethod'],
        where,
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...where, status: PaymentStatus.SUCCEEDED },
        _sum: { amount: true },
      }),
    ]);

    return {
      total,
      totalRevenue: Number(revenue._sum.amount || 0),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byMethod: byMethod.map((m) => ({
        method: m.paymentMethod,
        count: m._count,
        total: Number(m._sum.amount || 0),
      })),
    };
  }
}
