import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  PlanType,
  BillingCycle,
  SubscriptionStatus,
  InvoiceStatus,
  PaymentStatus,
  BillingJobType,
  JobStatus,
  BillingAttemptStatus,
  ReminderType,
  ReminderStatus,
  DiscountType,
  Prisma,
} from '@prisma/client';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  QueryInvoicesDto,
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  QueryCouponsDto,
  CreateBillingJobDto,
  QueryBillingJobsDto,
  RetryPaymentDto,
  DunningConfigDto,
  BillingStatsDto,
  CouponValidationResponseDto,
} from './dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  // Configuração padrão de dunning
  private readonly defaultDunningConfig: DunningConfigDto = {
    enabled: true,
    maxRetries: 4,
    retryDays: [1, 3, 7, 14], // Retry em 1, 3, 7, 14 dias após falha
    sendReminders: true,
    reminderDays: [-3, -1, 0, 3, 7], // 3 dias antes, 1 dia antes, no dia, 3 e 7 dias após
    cancelAfterDays: 30,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ============================================================================
  // INVOICES
  // ============================================================================

  async createInvoice(dto: CreateInvoiceDto) {
    // Gerar número da fatura
    const invoiceNumber = await this.generateInvoiceNumber();

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId: dto.tenantId,
        subscriptionId: dto.subscriptionId,
        invoiceNumber,
        subtotal: new Prisma.Decimal(dto.subtotal.toString()),
        discount: dto.discount
          ? new Prisma.Decimal(dto.discount.toString())
          : null,
        tax: dto.tax ? new Prisma.Decimal(dto.tax.toString()) : null,
        total: new Prisma.Decimal(dto.total.toString()),
        dueDate: new Date(dto.dueDate),
        description: dto.description,
        lineItems: dto.lineItems || [],
        status: InvoiceStatus.OPEN,
      },
      include: {
        tenant: { select: { id: true, name: true } },
        subscription: { select: { id: true, planType: true } },
      },
    });

    // Agendar lembretes
    await this.scheduleReminders(invoice.id, new Date(dto.dueDate));

    return invoice;
  }

  async findAllInvoices(query: QueryInvoicesDto) {
    const where: Prisma.InvoiceWhereInput = {};

    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.dueDateFrom || query.dueDateTo) {
      where.dueDate = {};
      if (query.dueDateFrom) {
        where.dueDate.gte = new Date(query.dueDateFrom);
      }
      if (query.dueDateTo) {
        where.dueDate.lte = new Date(query.dueDateTo);
      }
    }

    if (query.overdue) {
      where.status = InvoiceStatus.OPEN;
      where.dueDate = { lt: new Date() };
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          tenant: { select: { id: true, name: true } },
          subscription: { select: { id: true, planType: true } },
          payments: { select: { id: true, status: true, amount: true } },
        },
        orderBy: { dueDate: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { invoices, total };
  }

  async findInvoiceById(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        subscription: {
          select: { id: true, planType: true, billingCycle: true },
        },
        payments: true,
        attempts: { orderBy: { attemptNumber: 'desc' } },
        reminders: { orderBy: { scheduledFor: 'asc' } },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Fatura não encontrada');
    }

    return invoice;
  }

  async findTenantInvoices(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      include: {
        payments: { select: { id: true, status: true, paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateInvoice(invoiceId: string, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Fatura não encontrada');
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: dto.status,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        description: dto.description,
      },
    });
  }

  async markInvoiceAsPaid(invoiceId: string, paymentId?: string) {
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
      },
    });
  }

  async voidInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Fatura não encontrada');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Não é possível anular fatura paga');
    }

    // Cancelar lembretes pendentes
    await this.prisma.paymentReminder.updateMany({
      where: {
        invoiceId,
        status: ReminderStatus.SCHEDULED,
      },
      data: { status: ReminderStatus.CANCELLED },
    });

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.VOID },
    });
  }

  // ============================================================================
  // BILLING ATTEMPTS & RETRY
  // ============================================================================

  async processPayment(invoiceId: string): Promise<{
    success: boolean;
    error?: string;
    paymentId?: string;
  }> {
    const invoice = await this.findInvoiceById(invoiceId);

    if (invoice.status === InvoiceStatus.PAID) {
      return { success: true };
    }

    if (invoice.status === InvoiceStatus.VOID) {
      return { success: false, error: 'Fatura anulada' };
    }

    // Registrar tentativa
    const attemptNumber = invoice.billingAttempts + 1;
    const attempt = await this.prisma.billingAttempt.create({
      data: {
        invoiceId,
        attemptNumber,
        status: BillingAttemptStatus.PROCESSING,
      },
    });

    try {
      // TODO: Integrar com gateway de pagamento real
      // Por enquanto, simular processamento
      const paymentResult = await this.simulatePaymentProcessing(invoice);

      if (paymentResult.success) {
        // Atualizar tentativa como sucesso
        await this.prisma.billingAttempt.update({
          where: { id: attempt.id },
          data: { status: BillingAttemptStatus.SUCCESS },
        });

        // Marcar fatura como paga
        await this.markInvoiceAsPaid(invoiceId, paymentResult.paymentId);

        // Renovar assinatura se aplicável
        if (invoice.subscriptionId) {
          await this.renewSubscription(invoice.subscriptionId);
        }

        return { success: true, paymentId: paymentResult.paymentId };
      } else {
        throw new Error(paymentResult.error);
      }
    } catch (error) {
      // Atualizar tentativa como falha
      await this.prisma.billingAttempt.update({
        where: { id: attempt.id },
        data: {
          status: BillingAttemptStatus.FAILED,
          errorCode: 'PAYMENT_FAILED',
          errorMessage: error.message,
        },
      });

      // Atualizar invoice com tentativa
      const nextRetryDate = this.calculateNextRetryDate(attemptNumber);
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          billingAttempts: attemptNumber,
          lastAttemptAt: new Date(),
          nextAttemptAt: nextRetryDate,
        },
      });

      // Verificar se deve cancelar assinatura
      if (attemptNumber >= this.defaultDunningConfig.maxRetries!) {
        await this.handleMaxRetriesReached(invoice);
      } else if (nextRetryDate) {
        // Agendar próxima tentativa
        await this.scheduleRetry(invoiceId, nextRetryDate);
      }

      return { success: false, error: error.message };
    }
  }

  async retryPayment(dto: RetryPaymentDto) {
    const invoice = await this.findInvoiceById(dto.invoiceId);

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Fatura já está paga');
    }

    if (
      !dto.force &&
      invoice.billingAttempts >= this.defaultDunningConfig.maxRetries!
    ) {
      throw new BadRequestException(
        'Número máximo de tentativas atingido. Use force=true para forçar.',
      );
    }

    return this.processPayment(dto.invoiceId);
  }

  private calculateNextRetryDate(attemptNumber: number): Date | null {
    const retryDays = this.defaultDunningConfig.retryDays || [];
    if (attemptNumber >= retryDays.length) {
      return null;
    }

    const daysToAdd = retryDays[attemptNumber];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return nextDate;
  }

  private async scheduleRetry(invoiceId: string, retryDate: Date) {
    await this.prisma.billingJob.create({
      data: {
        jobType: BillingJobType.RETRY_PAYMENT,
        scheduledFor: retryDate,
        invoiceId,
      },
    });
  }

  private async handleMaxRetriesReached(invoice: any) {
    this.logger.warn(
      `Max retries reached for invoice ${invoice.id}. Tenant: ${invoice.tenantId}`,
    );

    if (invoice.subscriptionId) {
      // Marcar assinatura como não paga
      await this.prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: SubscriptionStatus.PAST_DUE },
      });

      // Agendar cancelamento
      const cancelDate = new Date();
      cancelDate.setDate(
        cancelDate.getDate() + (this.defaultDunningConfig.cancelAfterDays || 30),
      );

      await this.prisma.billingJob.create({
        data: {
          jobType: BillingJobType.CANCEL_SUBSCRIPTION,
          scheduledFor: cancelDate,
          subscriptionId: invoice.subscriptionId,
          tenantId: invoice.tenantId,
        },
      });
    }

    // Enviar notificação de conta em risco
    await this.prisma.paymentReminder.create({
      data: {
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        reminderType: ReminderType.SUBSCRIPTION_CANCELLED,
        scheduledFor: new Date(),
        status: ReminderStatus.SCHEDULED,
      },
    });
  }

  private async simulatePaymentProcessing(invoice: any): Promise<{
    success: boolean;
    paymentId?: string;
    error?: string;
  }> {
    // Simular processamento (90% de sucesso)
    const success = Math.random() > 0.1;

    if (success) {
      const payment = await this.prisma.payment.create({
        data: {
          tenantId: invoice.tenantId,
          subscriptionId: invoice.subscriptionId,
          invoiceId: invoice.id,
          amount: invoice.total,
          status: PaymentStatus.SUCCEEDED,
          paidAt: new Date(),
        },
      });

      return { success: true, paymentId: payment.id };
    }

    return { success: false, error: 'Pagamento recusado' };
  }

  // ============================================================================
  // SUBSCRIPTION RENEWAL
  // ============================================================================

  async renewSubscription(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    // Calcular novo período
    const newPeriodStart = subscription.currentPeriodEnd;
    const newPeriodEnd = this.calculatePeriodEnd(
      newPeriodStart,
      subscription.billingCycle,
    );

    // Aplicar mudança de plano agendada, se houver
    let planId = subscription.planId;
    let planType = subscription.planType;
    let amount = subscription.amount;

    if (subscription.scheduledPlanId && subscription.scheduledChange) {
      const scheduledPlan = await this.prisma.plan.findUnique({
        where: { id: subscription.scheduledPlanId },
      });

      if (scheduledPlan) {
        planId = scheduledPlan.id;
        planType = scheduledPlan.code;
        amount =
          subscription.billingCycle === BillingCycle.YEARLY
            ? scheduledPlan.yearlyPrice
            : scheduledPlan.monthlyPrice;

        // Atualizar tenant
        await this.prisma.tenant.update({
          where: { id: subscription.tenantId },
          data: { plan: scheduledPlan.code },
        });
      }
    }

    // Atualizar assinatura
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        planId,
        planType,
        amount,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: newPeriodStart,
        currentPeriodEnd: newPeriodEnd,
        scheduledPlanId: null,
        scheduledChange: null,
      },
    });

    this.logger.log(`Subscription ${subscriptionId} renewed until ${newPeriodEnd}`);
  }

  async generateSubscriptionInvoice(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: true,
        tenant: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada');
    }

    // Verificar se já existe fatura para o período
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: {
        subscriptionId,
        status: { in: [InvoiceStatus.OPEN, InvoiceStatus.DRAFT] },
        dueDate: { gte: subscription.currentPeriodStart },
      },
    });

    if (existingInvoice) {
      return existingInvoice;
    }

    // Calcular valores
    const subtotal = Number(subscription.amount);
    const discount = subscription.discount
      ? Number(subscription.discount)
      : 0;
    const total = subtotal - discount;

    // Data de vencimento = início do período
    const dueDate = subscription.currentPeriodEnd;

    return this.createInvoice({
      tenantId: subscription.tenantId,
      subscriptionId,
      subtotal,
      discount,
      total,
      dueDate: dueDate.toISOString(),
      description: `Assinatura ${subscription.plan?.name || subscription.planType} - ${this.formatPeriod(subscription.currentPeriodStart, subscription.currentPeriodEnd)}`,
      lineItems: [
        {
          description: `Plano ${subscription.plan?.name || subscription.planType}`,
          quantity: 1,
          unitPrice: subtotal,
          total: subtotal,
        },
      ],
    });
  }

  // ============================================================================
  // COUPONS
  // ============================================================================

  async createCoupon(dto: CreateCouponDto) {
    // Verificar se código já existe
    const existing = await this.prisma.coupon.findUnique({
      where: { code: dto.code.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException('Código de cupom já existe');
    }

    return this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        discountType: dto.discountType || DiscountType.PERCENTAGE,
        discountValue: new Prisma.Decimal(dto.discountValue.toString()),
        maxDiscountAmount: dto.maxDiscountAmount
          ? new Prisma.Decimal(dto.maxDiscountAmount.toString())
          : null,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        maxUses: dto.maxUses,
        applicablePlans: dto.applicablePlans || [],
        minAmount: dto.minAmount
          ? new Prisma.Decimal(dto.minAmount.toString())
          : null,
        firstPurchaseOnly: dto.firstPurchaseOnly || false,
        durationMonths: dto.durationMonths,
        isActive: dto.isActive !== false,
      },
    });
  }

  async findAllCoupons(query: QueryCouponsDto) {
    const where: Prisma.CouponWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.valid) {
      where.isActive = true;
      where.OR = [
        { validUntil: null },
        { validUntil: { gte: new Date() } },
      ];
      where.AND = [
        {
          OR: [
            { maxUses: null },
            { usedCount: { lt: this.prisma.coupon.fields.maxUses } },
          ],
        },
      ];
    }

    const [coupons, total] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit || 50,
        skip: query.offset || 0,
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return { coupons, total };
  }

  async findCouponByCode(code: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        usages: { take: 10, orderBy: { usedAt: 'desc' } },
      },
    });

    if (!coupon) {
      throw new NotFoundException('Cupom não encontrado');
    }

    return coupon;
  }

  async updateCoupon(couponId: string, dto: UpdateCouponDto) {
    return this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        name: dto.name,
        discountValue: dto.discountValue
          ? new Prisma.Decimal(dto.discountValue.toString())
          : undefined,
        maxDiscountAmount: dto.maxDiscountAmount
          ? new Prisma.Decimal(dto.maxDiscountAmount.toString())
          : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        maxUses: dto.maxUses,
        isActive: dto.isActive,
      },
    });
  }

  async validateCoupon(dto: ValidateCouponDto): Promise<CouponValidationResponseDto> {
    try {
      const coupon = await this.prisma.coupon.findUnique({
        where: { code: dto.code.toUpperCase() },
      });

      if (!coupon) {
        return { valid: false, code: dto.code, message: 'Cupom não encontrado' };
      }

      if (!coupon.isActive) {
        return { valid: false, code: dto.code, message: 'Cupom inativo' };
      }

      if (coupon.validUntil && coupon.validUntil < new Date()) {
        return { valid: false, code: dto.code, message: 'Cupom expirado' };
      }

      if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
        return { valid: false, code: dto.code, message: 'Cupom esgotado' };
      }

      if (
        coupon.applicablePlans.length > 0 &&
        !coupon.applicablePlans.includes(dto.planCode)
      ) {
        return {
          valid: false,
          code: dto.code,
          message: 'Cupom não aplicável a este plano',
        };
      }

      if (dto.amount && coupon.minAmount && dto.amount < Number(coupon.minAmount)) {
        return {
          valid: false,
          code: dto.code,
          message: `Valor mínimo para este cupom: R$ ${coupon.minAmount}`,
        };
      }

      // Verificar primeira compra
      if (coupon.firstPurchaseOnly && dto.tenantId) {
        const previousUsage = await this.prisma.couponUsage.findFirst({
          where: { tenantId: dto.tenantId },
        });

        if (previousUsage) {
          return {
            valid: false,
            code: dto.code,
            message: 'Cupom válido apenas para primeira compra',
          };
        }
      }

      // Calcular desconto
      const amount = dto.amount || 0;
      let calculatedDiscount: number;

      if (coupon.discountType === DiscountType.PERCENTAGE) {
        calculatedDiscount = (amount * Number(coupon.discountValue)) / 100;
        if (coupon.maxDiscountAmount) {
          calculatedDiscount = Math.min(
            calculatedDiscount,
            Number(coupon.maxDiscountAmount),
          );
        }
      } else {
        calculatedDiscount = Number(coupon.discountValue);
      }

      const finalAmount = Math.max(0, amount - calculatedDiscount);

      return {
        valid: true,
        code: dto.code,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        calculatedDiscount,
        originalAmount: amount,
        finalAmount,
      };
    } catch (error) {
      return { valid: false, code: dto.code, message: error.message };
    }
  }

  async applyCoupon(
    couponCode: string,
    tenantId: string,
    subscriptionId: string,
    amount: number,
  ) {
    const coupon = await this.findCouponByCode(couponCode);

    // Calcular desconto
    let discount: number;
    if (coupon.discountType === DiscountType.PERCENTAGE) {
      discount = (amount * Number(coupon.discountValue)) / 100;
      if (coupon.maxDiscountAmount) {
        discount = Math.min(discount, Number(coupon.maxDiscountAmount));
      }
    } else {
      discount = Number(coupon.discountValue);
    }

    // Registrar uso
    await this.prisma.couponUsage.create({
      data: {
        couponId: coupon.id,
        tenantId,
        subscriptionId,
        discountApplied: new Prisma.Decimal(discount.toString()),
      },
    });

    // Incrementar contador
    await this.prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });

    return { discount, durationMonths: coupon.durationMonths };
  }

  // ============================================================================
  // REMINDERS / DUNNING
  // ============================================================================

  private async scheduleReminders(invoiceId: string, dueDate: Date) {
    const reminderDays = this.defaultDunningConfig.reminderDays || [];

    for (const days of reminderDays) {
      const scheduledFor = new Date(dueDate);
      scheduledFor.setDate(scheduledFor.getDate() + days);

      // Não agendar no passado
      if (scheduledFor < new Date()) continue;

      const reminderType =
        days < 0
          ? ReminderType.PAYMENT_DUE
          : days === 0
            ? ReminderType.PAYMENT_DUE
            : ReminderType.PAYMENT_OVERDUE;

      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
      });

      if (invoice) {
        await this.prisma.paymentReminder.create({
          data: {
            invoiceId,
            tenantId: invoice.tenantId,
            reminderType,
            scheduledFor,
            status: ReminderStatus.SCHEDULED,
          },
        });
      }
    }
  }

  async processReminder(reminderId: string) {
    const reminder = await this.prisma.paymentReminder.findUnique({
      where: { id: reminderId },
      include: {
        invoice: {
          include: {
            tenant: true,
            subscription: { include: { plan: true } },
          },
        },
      },
    });

    if (!reminder) {
      throw new NotFoundException('Lembrete não encontrado');
    }

    if (reminder.invoice.status === InvoiceStatus.PAID) {
      // Cancelar lembrete se fatura já foi paga
      await this.prisma.paymentReminder.update({
        where: { id: reminderId },
        data: { status: ReminderStatus.CANCELLED },
      });
      return;
    }

    try {
      // TODO: Integrar com serviço de notificações
      // await this.notificationsService.sendPaymentReminder(reminder);

      await this.prisma.paymentReminder.update({
        where: { id: reminderId },
        data: {
          status: ReminderStatus.SENT,
          sentAt: new Date(),
        },
      });

      this.logger.log(`Reminder ${reminderId} sent for invoice ${reminder.invoiceId}`);
    } catch (error) {
      await this.prisma.paymentReminder.update({
        where: { id: reminderId },
        data: {
          status: ReminderStatus.FAILED,
          errorMessage: error.message,
        },
      });

      this.logger.error(`Failed to send reminder ${reminderId}: ${error.message}`);
    }
  }

  // ============================================================================
  // BILLING JOBS
  // ============================================================================

  async createBillingJob(dto: CreateBillingJobDto) {
    return this.prisma.billingJob.create({
      data: {
        jobType: dto.jobType,
        scheduledFor: new Date(dto.scheduledFor),
        tenantId: dto.tenantId,
        subscriptionId: dto.subscriptionId,
        invoiceId: dto.invoiceId,
        maxRetries: dto.maxRetries || 3,
      },
    });
  }

  async findPendingJobs(query: QueryBillingJobsDto) {
    const where: Prisma.BillingJobWhereInput = {
      status: { in: [JobStatus.PENDING, JobStatus.FAILED] },
      scheduledFor: { lte: new Date() },
    };

    if (query.jobType) {
      where.jobType = query.jobType;
    }

    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    return this.prisma.billingJob.findMany({
      where,
      orderBy: { scheduledFor: 'asc' },
      take: query.limit || 100,
    });
  }

  async processJob(jobId: string) {
    const job = await this.prisma.billingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Job não encontrado');
    }

    // Marcar como running
    await this.prisma.billingJob.update({
      where: { id: jobId },
      data: { status: JobStatus.RUNNING, startedAt: new Date() },
    });

    try {
      let result: any;

      switch (job.jobType) {
        case BillingJobType.GENERATE_INVOICE:
          if (job.subscriptionId) {
            result = await this.generateSubscriptionInvoice(job.subscriptionId);
          }
          break;

        case BillingJobType.PROCESS_PAYMENT:
        case BillingJobType.RETRY_PAYMENT:
          if (job.invoiceId) {
            result = await this.processPayment(job.invoiceId);
          }
          break;

        case BillingJobType.SEND_REMINDER:
          // Processar lembretes pendentes
          const reminders = await this.prisma.paymentReminder.findMany({
            where: {
              status: ReminderStatus.SCHEDULED,
              scheduledFor: { lte: new Date() },
            },
            take: 50,
          });
          for (const reminder of reminders) {
            await this.processReminder(reminder.id);
          }
          result = { processed: reminders.length };
          break;

        case BillingJobType.EXPIRE_TRIAL:
          if (job.subscriptionId) {
            result = await this.expireTrial(job.subscriptionId);
          }
          break;

        case BillingJobType.RENEW_SUBSCRIPTION:
          if (job.subscriptionId) {
            await this.renewSubscription(job.subscriptionId);
            result = { renewed: true };
          }
          break;

        case BillingJobType.CANCEL_SUBSCRIPTION:
          if (job.subscriptionId) {
            result = await this.cancelSubscriptionDueToPayment(job.subscriptionId);
          }
          break;

        default:
          throw new Error(`Unknown job type: ${job.jobType}`);
      }

      await this.prisma.billingJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          result,
        },
      });

      return result;
    } catch (error) {
      const retryCount = job.retryCount + 1;
      const shouldRetry = retryCount < job.maxRetries;

      await this.prisma.billingJob.update({
        where: { id: jobId },
        data: {
          status: shouldRetry ? JobStatus.FAILED : JobStatus.CANCELLED,
          errorMessage: error.message,
          retryCount,
          lastRetryAt: new Date(),
        },
      });

      if (shouldRetry) {
        // Reagendar para 1 hora depois
        const nextRun = new Date();
        nextRun.setHours(nextRun.getHours() + 1);

        await this.prisma.billingJob.update({
          where: { id: jobId },
          data: {
            status: JobStatus.PENDING,
            scheduledFor: nextRun,
          },
        });
      }

      throw error;
    }
  }

  private async expireTrial(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription || subscription.status !== SubscriptionStatus.TRIALING) {
      return { expired: false, reason: 'Not in trial' };
    }

    // Gerar primeira fatura
    const invoice = await this.generateSubscriptionInvoice(subscriptionId);

    // Tentar cobrar
    const paymentResult = await this.processPayment(invoice.id);

    if (paymentResult.success) {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.ACTIVE },
      });
      return { expired: true, converted: true };
    } else {
      await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.PAST_DUE },
      });
      return { expired: true, converted: false, error: paymentResult.error };
    }
  }

  private async cancelSubscriptionDueToPayment(subscriptionId: string) {
    const subscription = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'Pagamento não efetuado',
      },
    });

    // Downgrade para FREE
    await this.prisma.tenant.update({
      where: { id: subscription.tenantId },
      data: { plan: PlanType.FREE },
    });

    this.logger.warn(
      `Subscription ${subscriptionId} cancelled due to non-payment`,
    );

    return { cancelled: true };
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  async getBillingStats(): Promise<BillingStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Subscriptions
    const subscriptions = await this.prisma.subscription.groupBy({
      by: ['status', 'planType'],
      _count: true,
      _sum: { amount: true },
    });

    // Calculate MRR
    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE },
      select: { amount: true, billingCycle: true },
    });

    let mrr = 0;
    for (const sub of activeSubscriptions) {
      const monthlyAmount =
        sub.billingCycle === BillingCycle.YEARLY
          ? Number(sub.amount) / 12
          : sub.billingCycle === BillingCycle.QUARTERLY
            ? Number(sub.amount) / 3
            : Number(sub.amount);
      mrr += monthlyAmount;
    }

    // Invoices
    const invoiceStats = await this.prisma.invoice.groupBy({
      by: ['status'],
      _count: true,
      _sum: { total: true },
    });

    const paidInvoices =
      invoiceStats.find((i) => i.status === InvoiceStatus.PAID)?._count || 0;
    const overdueInvoices = await this.prisma.invoice.count({
      where: {
        status: InvoiceStatus.OPEN,
        dueDate: { lt: now },
      },
    });

    // Payments
    const paymentStats = await this.prisma.payment.groupBy({
      by: ['status'],
      _count: true,
      _sum: { amount: true },
      where: { createdAt: { gte: startOfMonth } },
    });

    const successfulPayments =
      paymentStats.find((p) => p.status === PaymentStatus.SUCCEEDED)?._count ||
      0;
    const failedPayments =
      paymentStats.find((p) => p.status === PaymentStatus.FAILED)?._count || 0;
    const totalPayments = successfulPayments + failedPayments;

    // Churn
    const cancelledThisMonth = await this.prisma.subscription.count({
      where: {
        status: SubscriptionStatus.CANCELLED,
        cancelledAt: { gte: startOfMonth },
      },
    });

    const activeAtStartOfMonth = await this.prisma.subscription.count({
      where: {
        createdAt: { lt: startOfMonth },
        OR: [
          { status: SubscriptionStatus.ACTIVE },
          {
            status: SubscriptionStatus.CANCELLED,
            cancelledAt: { gte: startOfMonth },
          },
        ],
      },
    });

    const churnRate =
      activeAtStartOfMonth > 0
        ? (cancelledThisMonth / activeAtStartOfMonth) * 100
        : 0;

    // By plan
    const subscribersByPlan = subscriptions
      .filter((s) => s.status === SubscriptionStatus.ACTIVE)
      .map((s) => ({
        plan: s.planType,
        count: s._count,
        revenue: Number(s._sum.amount) || 0,
      }));

    return {
      mrr,
      mrrGrowth: 0, // TODO: Calculate growth
      arr: mrr * 12,
      churnRate,
      churnedSubscriptions: cancelledThisMonth,
      totalInvoices: invoiceStats.reduce((sum, i) => sum + i._count, 0),
      paidInvoices,
      overdueInvoices,
      pendingAmount:
        Number(
          invoiceStats.find((i) => i.status === InvoiceStatus.OPEN)?._sum
            .total,
        ) || 0,
      totalCollected:
        Number(
          paymentStats.find((p) => p.status === PaymentStatus.SUCCEEDED)?._sum
            .amount,
        ) || 0,
      failedPayments,
      successRate:
        totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 100,
      totalSubscribers: subscriptions.reduce((sum, s) => sum + s._count, 0),
      activeSubscribers: subscriptions
        .filter((s) => s.status === SubscriptionStatus.ACTIVE)
        .reduce((sum, s) => sum + s._count, 0),
      trialingSubscribers: subscriptions
        .filter((s) => s.status === SubscriptionStatus.TRIALING)
        .reduce((sum, s) => sum + s._count, 0),
      cancelledSubscribers: subscriptions
        .filter((s) => s.status === SubscriptionStatus.CANCELLED)
        .reduce((sum, s) => sum + s._count, 0),
      subscribersByPlan,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');

    const lastInvoice = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber: { startsWith: `INV-${year}${month}` },
      },
      orderBy: { invoiceNumber: 'desc' },
    });

    let sequence = 1;
    if (lastInvoice?.invoiceNumber) {
      const lastSequence = parseInt(
        lastInvoice.invoiceNumber.split('-')[2] || '0',
      );
      sequence = lastSequence + 1;
    }

    return `INV-${year}${month}-${String(sequence).padStart(4, '0')}`;
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

  private formatPeriod(start: Date, end: Date): string {
    const formatDate = (d: Date) =>
      d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    return `${formatDate(start)} - ${formatDate(end)}`;
  }
}
