import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from './billing.service';
import {
  JobStatus,
  BillingJobType,
  SubscriptionStatus,
  InvoiceStatus,
  ReminderStatus,
} from '@prisma/client';

@Injectable()
export class BillingScheduler implements OnModuleInit {
  private readonly logger = new Logger(BillingScheduler.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async onModuleInit() {
    this.logger.log('Billing Scheduler initialized');
  }

  /**
   * Processa jobs de billing pendentes a cada 5 minutos
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processJobs() {
    if (this.isProcessing) {
      this.logger.warn('Job processing already in progress, skipping...');
      return;
    }

    this.isProcessing = true;

    try {
      const jobs = await this.prisma.billingJob.findMany({
        where: {
          status: { in: [JobStatus.PENDING, JobStatus.FAILED] },
          scheduledFor: { lte: new Date() },
          retryCount: { lt: this.prisma.billingJob.fields.maxRetries },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 50,
      });

      this.logger.log(`Processing ${jobs.length} billing jobs`);

      for (const job of jobs) {
        try {
          await this.billingService.processJob(job.id);
          this.logger.log(`Job ${job.id} (${job.jobType}) processed successfully`);
        } catch (error) {
          this.logger.error(
            `Failed to process job ${job.id}: ${error.message}`,
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Verifica assinaturas com trial expirando - a cada hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkExpiringTrials() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Encontrar trials que expiram nas próximas 24h
    const expiringTrials = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.TRIALING,
        trialEnd: {
          gte: now,
          lte: tomorrow,
        },
      },
    });

    this.logger.log(`Found ${expiringTrials.length} trials expiring in 24h`);

    for (const subscription of expiringTrials) {
      // Verificar se já existe job agendado
      const existingJob = await this.prisma.billingJob.findFirst({
        where: {
          subscriptionId: subscription.id,
          jobType: BillingJobType.EXPIRE_TRIAL,
          status: JobStatus.PENDING,
        },
      });

      if (!existingJob && subscription.trialEnd) {
        await this.prisma.billingJob.create({
          data: {
            jobType: BillingJobType.EXPIRE_TRIAL,
            scheduledFor: subscription.trialEnd,
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
          },
        });

        this.logger.log(
          `Scheduled trial expiration for subscription ${subscription.id}`,
        );
      }
    }
  }

  /**
   * Gera faturas para assinaturas com renovação próxima - diariamente às 2h
   */
  @Cron('0 2 * * *')
  async generateUpcomingInvoices() {
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    // Encontrar assinaturas que renovam nos próximos 7 dias
    const upcomingRenewals = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: {
          gte: now,
          lte: in7Days,
        },
      },
      include: {
        invoices: {
          where: {
            status: { in: [InvoiceStatus.OPEN, InvoiceStatus.DRAFT] },
          },
        },
      },
    });

    this.logger.log(
      `Found ${upcomingRenewals.length} subscriptions renewing in next 7 days`,
    );

    for (const subscription of upcomingRenewals) {
      // Verificar se já existe fatura para o período
      const hasOpenInvoice = subscription.invoices.length > 0;

      if (!hasOpenInvoice) {
        try {
          await this.billingService.generateSubscriptionInvoice(subscription.id);
          this.logger.log(`Generated invoice for subscription ${subscription.id}`);
        } catch (error) {
          this.logger.error(
            `Failed to generate invoice for subscription ${subscription.id}: ${error.message}`,
          );
        }
      }
    }
  }

  /**
   * Processa pagamentos de faturas vencidas - a cada 30 minutos
   */
  @Cron('*/30 * * * *')
  async processOverduePayments() {
    const now = new Date();

    // Encontrar faturas vencidas que ainda não atingiram max retries
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.OPEN,
        dueDate: { lte: now },
        nextAttemptAt: { lte: now },
        billingAttempts: { lt: 4 }, // Max 4 tentativas
      },
      take: 20,
    });

    this.logger.log(`Processing ${overdueInvoices.length} overdue invoices`);

    for (const invoice of overdueInvoices) {
      try {
        const result = await this.billingService.processPayment(invoice.id);
        if (result.success) {
          this.logger.log(`Invoice ${invoice.id} paid successfully`);
        } else {
          this.logger.warn(
            `Invoice ${invoice.id} payment failed: ${result.error}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error processing invoice ${invoice.id}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Envia lembretes de pagamento - a cada hora
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendPaymentReminders() {
    const now = new Date();

    const pendingReminders = await this.prisma.paymentReminder.findMany({
      where: {
        status: ReminderStatus.SCHEDULED,
        scheduledFor: { lte: now },
      },
      include: {
        invoice: true,
      },
      take: 50,
    });

    this.logger.log(`Sending ${pendingReminders.length} payment reminders`);

    for (const reminder of pendingReminders) {
      // Não enviar se a fatura já foi paga
      if (reminder.invoice.status === InvoiceStatus.PAID) {
        await this.prisma.paymentReminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.CANCELLED },
        });
        continue;
      }

      try {
        await this.billingService.processReminder(reminder.id);
      } catch (error) {
        this.logger.error(
          `Failed to send reminder ${reminder.id}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Limpa jobs antigos - semanalmente aos domingos às 3h
   */
  @Cron('0 3 * * 0')
  async cleanupOldJobs() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const deleted = await this.prisma.billingJob.deleteMany({
      where: {
        status: { in: [JobStatus.COMPLETED, JobStatus.CANCELLED] },
        completedAt: { lt: thirtyDaysAgo },
      },
    });

    this.logger.log(`Cleaned up ${deleted.count} old billing jobs`);
  }

  /**
   * Relatório diário de billing - às 8h
   */
  @Cron('0 8 * * *')
  async dailyBillingReport() {
    try {
      const stats = await this.billingService.getBillingStats();

      this.logger.log('=== Daily Billing Report ===');
      this.logger.log(`MRR: R$ ${stats.mrr.toFixed(2)}`);
      this.logger.log(`Active Subscribers: ${stats.activeSubscribers}`);
      this.logger.log(`Trialing: ${stats.trialingSubscribers}`);
      this.logger.log(`Overdue Invoices: ${stats.overdueInvoices}`);
      this.logger.log(`Pending Amount: R$ ${stats.pendingAmount.toFixed(2)}`);
      this.logger.log(`Success Rate: ${stats.successRate.toFixed(1)}%`);
      this.logger.log(`Churn Rate: ${stats.churnRate.toFixed(2)}%`);
      this.logger.log('============================');

      // TODO: Enviar relatório por email para admin
    } catch (error) {
      this.logger.error(`Failed to generate daily report: ${error.message}`);
    }
  }

  /**
   * Verifica assinaturas expiradas - a cada 15 minutos
   */
  @Cron('*/15 * * * *')
  async checkExpiredSubscriptions() {
    const now = new Date();

    // Encontrar assinaturas ativas que já passaram do período
    const expiredSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { lt: now },
      },
    });

    for (const subscription of expiredSubscriptions) {
      // Verificar se existe fatura paga para o próximo período
      const paidInvoice = await this.prisma.invoice.findFirst({
        where: {
          subscriptionId: subscription.id,
          status: InvoiceStatus.PAID,
          dueDate: { gte: subscription.currentPeriodStart },
        },
      });

      if (paidInvoice) {
        // Renovar assinatura
        try {
          await this.billingService.renewSubscription(subscription.id);
          this.logger.log(`Renewed subscription ${subscription.id}`);
        } catch (error) {
          this.logger.error(
            `Failed to renew subscription ${subscription.id}: ${error.message}`,
          );
        }
      } else {
        // Marcar como atrasada
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.PAST_DUE },
        });

        this.logger.warn(
          `Subscription ${subscription.id} marked as PAST_DUE`,
        );
      }
    }
  }
}
