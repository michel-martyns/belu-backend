import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import {
  QUEUE_NAMES,
  EMAIL_JOBS,
  NOTIFICATION_JOBS,
  WHATSAPP_JOBS,
  BILLING_JOBS,
  REPORTS_JOBS,
  JOB_OPTIONS,
  JOB_PRIORITY,
  EmailJobData,
  NotificationJobData,
  WhatsAppJobData,
  BillingJobData,
  ReportJobData,
} from './queues.constants';

@Injectable()
export class QueuesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueuesService.name);
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();
  private redisConnection: { host: string; port: number; password?: string };

  constructor(private configService: ConfigService) {
    // Parsear URL do Redis
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    const url = new URL(redisUrl);
    this.redisConnection = {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
    };
  }

  async onModuleInit() {
    this.logger.log('Initializing BullMQ queues...');

    // Criar todas as filas
    for (const queueName of Object.values(QUEUE_NAMES)) {
      await this.createQueue(queueName);
    }

    this.logger.log(`BullMQ queues initialized: ${Object.values(QUEUE_NAMES).join(', ')}`);
  }

  async onModuleDestroy() {
    this.logger.log('Closing BullMQ connections...');

    // Fechar workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      this.logger.debug(`Worker ${name} closed`);
    }

    // Fechar queue events
    for (const [name, events] of this.queueEvents) {
      await events.close();
      this.logger.debug(`QueueEvents ${name} closed`);
    }

    // Fechar filas
    for (const [name, queue] of this.queues) {
      await queue.close();
      this.logger.debug(`Queue ${name} closed`);
    }

    this.logger.log('All BullMQ connections closed');
  }

  /**
   * Cria uma fila
   */
  private async createQueue(name: string): Promise<Queue> {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });

    // Criar eventos da fila para monitoramento
    const events = new QueueEvents(name, {
      connection: this.redisConnection,
    });

    events.on('completed', ({ jobId }) => {
      this.logger.debug(`Job ${jobId} completed in queue ${name}`);
    });

    events.on('failed', ({ jobId, failedReason }) => {
      this.logger.error(`Job ${jobId} failed in queue ${name}: ${failedReason}`);
    });

    this.queues.set(name, queue);
    this.queueEvents.set(name, events);

    return queue;
  }

  /**
   * Obtém uma fila pelo nome
   */
  getQueue(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue ${name} not found`);
    }
    return queue;
  }

  /**
   * Obtém todas as filas (para Bull Board)
   */
  getAllQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  /**
   * Registra um worker para processar jobs
   */
  registerWorker(
    queueName: string,
    processor: (job: Job) => Promise<any>,
    options?: { concurrency?: number },
  ): Worker {
    if (this.workers.has(queueName)) {
      this.logger.warn(`Worker for queue ${queueName} already exists, replacing...`);
      this.workers.get(queueName)?.close();
    }

    const worker = new Worker(queueName, processor, {
      connection: this.redisConnection,
      concurrency: options?.concurrency || 5,
    });

    worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id} completed in ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed in ${queueName}: ${err.message}`);
    });

    worker.on('error', (err) => {
      this.logger.error(`Worker error in ${queueName}: ${err.message}`);
    });

    this.workers.set(queueName, worker);
    this.logger.log(`Worker registered for queue ${queueName}`);

    return worker;
  }

  // ============================================================================
  // EMAIL QUEUE METHODS
  // ============================================================================

  /**
   * Adiciona um job de envio de email
   */
  async addEmailJob(
    jobName: string,
    data: EmailJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job<EmailJobData>> {
    const queue = this.getQueue(QUEUE_NAMES.EMAIL);
    return queue.add(jobName, data, {
      ...JOB_OPTIONS.EMAIL,
      priority: options?.priority || JOB_PRIORITY.NORMAL,
      delay: options?.delay,
    });
  }

  async sendEmail(data: EmailJobData): Promise<Job<EmailJobData>> {
    return this.addEmailJob(EMAIL_JOBS.SEND_EMAIL, data);
  }

  async sendPasswordResetEmail(
    to: string,
    userName: string,
    resetLink: string,
  ): Promise<Job<EmailJobData>> {
    return this.addEmailJob(EMAIL_JOBS.SEND_PASSWORD_RESET, {
      to,
      subject: 'Recuperação de Senha - Belu',
      template: 'password-reset',
      context: { userName, resetLink },
    }, { priority: JOB_PRIORITY.HIGH });
  }

  async sendWelcomeEmail(
    to: string,
    userName: string,
    businessName: string,
  ): Promise<Job<EmailJobData>> {
    return this.addEmailJob(EMAIL_JOBS.SEND_WELCOME, {
      to,
      subject: `Bem-vindo ao Belu - ${businessName}`,
      template: 'welcome',
      context: { userName, businessName },
    });
  }

  // ============================================================================
  // NOTIFICATION QUEUE METHODS
  // ============================================================================

  /**
   * Adiciona um job de notificação
   */
  async addNotificationJob(
    jobName: string,
    data: NotificationJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job<NotificationJobData>> {
    const queue = this.getQueue(QUEUE_NAMES.NOTIFICATION);

    // Se tiver scheduledAt, calcular delay
    let delay = options?.delay;
    if (data.scheduledAt && !delay) {
      const now = new Date();
      const scheduled = new Date(data.scheduledAt);
      delay = Math.max(0, scheduled.getTime() - now.getTime());
    }

    return queue.add(jobName, data, {
      ...JOB_OPTIONS.EMAIL,
      priority: options?.priority || JOB_PRIORITY.NORMAL,
      delay,
    });
  }

  async sendNotification(data: NotificationJobData): Promise<Job<NotificationJobData>> {
    return this.addNotificationJob(NOTIFICATION_JOBS.SEND_NOTIFICATION, data);
  }

  async sendBulkNotifications(
    notifications: NotificationJobData[],
  ): Promise<Job<NotificationJobData>[]> {
    const queue = this.getQueue(QUEUE_NAMES.NOTIFICATION);
    const jobs = notifications.map((data) => ({
      name: NOTIFICATION_JOBS.SEND_NOTIFICATION,
      data,
      opts: { ...JOB_OPTIONS.EMAIL },
    }));
    return queue.addBulk(jobs);
  }

  // ============================================================================
  // WHATSAPP QUEUE METHODS
  // ============================================================================

  /**
   * Adiciona um job de WhatsApp
   */
  async addWhatsAppJob(
    jobName: string,
    data: WhatsAppJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job<WhatsAppJobData>> {
    const queue = this.getQueue(QUEUE_NAMES.WHATSAPP);
    return queue.add(jobName, data, {
      ...JOB_OPTIONS.WHATSAPP,
      priority: options?.priority || JOB_PRIORITY.NORMAL,
      delay: options?.delay,
    });
  }

  async sendWhatsAppMessage(data: WhatsAppJobData): Promise<Job<WhatsAppJobData>> {
    return this.addWhatsAppJob(WHATSAPP_JOBS.SEND_MESSAGE, data);
  }

  async sendWhatsAppTemplate(
    data: Omit<WhatsAppJobData, 'message'> & { templateName: string },
  ): Promise<Job<WhatsAppJobData>> {
    return this.addWhatsAppJob(WHATSAPP_JOBS.SEND_TEMPLATE, data as WhatsAppJobData);
  }

  // ============================================================================
  // BILLING QUEUE METHODS
  // ============================================================================

  /**
   * Adiciona um job de billing
   */
  async addBillingJob(
    jobName: string,
    data: BillingJobData,
    options?: { priority?: number; delay?: number },
  ): Promise<Job<BillingJobData>> {
    const queue = this.getQueue(QUEUE_NAMES.BILLING);
    return queue.add(jobName, data, {
      ...JOB_OPTIONS.BILLING,
      priority: options?.priority || JOB_PRIORITY.NORMAL,
      delay: options?.delay,
    });
  }

  async generateInvoice(subscriptionId: string, tenantId: string): Promise<Job<BillingJobData>> {
    return this.addBillingJob(BILLING_JOBS.GENERATE_INVOICE, {
      subscriptionId,
      tenantId,
      jobType: BILLING_JOBS.GENERATE_INVOICE,
    });
  }

  async processPayment(paymentId: string, tenantId: string): Promise<Job<BillingJobData>> {
    return this.addBillingJob(BILLING_JOBS.PROCESS_PAYMENT, {
      paymentId,
      tenantId,
      jobType: BILLING_JOBS.PROCESS_PAYMENT,
    }, { priority: JOB_PRIORITY.HIGH });
  }

  // ============================================================================
  // REPORTS QUEUE METHODS
  // ============================================================================

  /**
   * Adiciona um job de relatório
   */
  async addReportJob(
    jobName: string,
    data: ReportJobData,
    options?: { priority?: number },
  ): Promise<Job<ReportJobData>> {
    const queue = this.getQueue(QUEUE_NAMES.REPORTS);
    return queue.add(jobName, data, {
      ...JOB_OPTIONS.REPORTS,
      priority: options?.priority || JOB_PRIORITY.LOW,
    });
  }

  async generateFinancialReport(
    tenantId: string,
    startDate: Date,
    endDate: Date,
    recipientEmail?: string,
  ): Promise<Job<ReportJobData>> {
    return this.addReportJob(REPORTS_JOBS.GENERATE_FINANCIAL, {
      tenantId,
      reportType: 'financial',
      startDate,
      endDate,
      format: 'pdf',
      recipientEmail,
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Obtém estatísticas de uma fila
   */
  async getQueueStats(queueName: string) {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      name: queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * Obtém estatísticas de todas as filas
   */
  async getAllQueueStats(): Promise<Array<{
    name: string;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    total: number;
  }>> {
    const stats: Array<{
      name: string;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      total: number;
    }> = [];
    for (const queueName of Object.values(QUEUE_NAMES)) {
      stats.push(await this.getQueueStats(queueName));
    }
    return stats;
  }

  /**
   * Limpa uma fila (apenas jobs completados e falhos)
   */
  async cleanQueue(queueName: string, grace: number = 0) {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, 1000, 'completed');
    await queue.clean(grace, 1000, 'failed');
    this.logger.log(`Queue ${queueName} cleaned`);
  }

  /**
   * Pausa uma fila
   */
  async pauseQueue(queueName: string) {
    const queue = this.getQueue(queueName);
    await queue.pause();
    this.logger.log(`Queue ${queueName} paused`);
  }

  /**
   * Resume uma fila
   */
  async resumeQueue(queueName: string) {
    const queue = this.getQueue(queueName);
    await queue.resume();
    this.logger.log(`Queue ${queueName} resumed`);
  }

  /**
   * Remove um job específico
   */
  async removeJob(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.log(`Job ${jobId} removed from queue ${queueName}`);
    }
  }

  /**
   * Retry um job falho
   */
  async retryJob(queueName: string, jobId: string) {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (job) {
      await job.retry();
      this.logger.log(`Job ${jobId} retried in queue ${queueName}`);
    }
  }
}
