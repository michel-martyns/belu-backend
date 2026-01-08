import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueuesService } from '../queues.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QUEUE_NAMES,
  NOTIFICATION_JOBS,
  NotificationJobData,
  EMAIL_JOBS,
  WHATSAPP_JOBS,
} from '../queues.constants';
import { NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationProcessor implements OnModuleInit {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private queuesService: QueuesService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.queuesService.registerWorker(
      QUEUE_NAMES.NOTIFICATION,
      this.process.bind(this),
      { concurrency: 5 },
    );
    this.logger.log('Notification processor initialized');
  }

  async process(job: Job<NotificationJobData>): Promise<any> {
    this.logger.debug(`Processing notification job ${job.id}: ${job.name}`);

    const { data } = job;

    try {
      switch (job.name) {
        case NOTIFICATION_JOBS.SEND_NOTIFICATION:
          return this.handleSendNotification(job);

        case NOTIFICATION_JOBS.SEND_BULK:
          return this.handleBulkNotification(job);

        case NOTIFICATION_JOBS.PROCESS_SCHEDULED:
          return this.handleProcessScheduled(job);

        default:
          this.logger.warn(`Unknown notification job type: ${job.name}`);
          return this.handleSendNotification(job);
      }
    } catch (error) {
      this.logger.error(`Notification job ${job.id} failed: ${error.message}`);

      // Atualizar status da notificação no banco
      if (data.notificationId) {
        await this.updateNotificationStatus(
          data.notificationId,
          NotificationStatus.FAILED,
          error.message,
        );
      }

      throw error;
    }
  }

  private async handleSendNotification(job: Job<NotificationJobData>): Promise<boolean> {
    const { data } = job;
    const {
      tenantId,
      notificationId,
      channel,
      recipientPhone,
      recipientEmail,
      content,
      subject,
    } = data;

    await job.updateProgress(10);

    // Se tiver notificationId, atualizar status para SENDING
    if (notificationId) {
      await this.updateNotificationStatus(notificationId, NotificationStatus.SENDING);
    }

    await job.updateProgress(30);

    // Rotear para a fila apropriada baseado no canal
    switch (channel) {
      case 'WHATSAPP':
        if (!recipientPhone) {
          throw new Error('Phone number is required for WhatsApp notifications');
        }
        await this.queuesService.addWhatsAppJob(WHATSAPP_JOBS.SEND_MESSAGE, {
          tenantId,
          to: recipientPhone,
          message: content,
          notificationId,
        });
        break;

      case 'EMAIL':
        if (!recipientEmail) {
          throw new Error('Email is required for email notifications');
        }
        await this.queuesService.addEmailJob(EMAIL_JOBS.SEND_EMAIL, {
          to: recipientEmail,
          subject: subject || 'Notificação',
          html: content,
          tenantId,
        });
        break;

      case 'SMS':
        // TODO: Implementar SMS quando disponível
        this.logger.warn(`SMS channel not implemented yet`);
        break;

      case 'PUSH':
        // TODO: Implementar Push Notifications quando disponível
        this.logger.warn(`Push notification channel not implemented yet`);
        break;

      default:
        throw new Error(`Unknown notification channel: ${channel}`);
    }

    await job.updateProgress(80);

    // Atualizar status para SENT (o status final será atualizado pelo processador específico)
    if (notificationId) {
      await this.updateNotificationStatus(notificationId, NotificationStatus.SENT);
    }

    await job.updateProgress(100);

    this.logger.log(
      `Notification routed to ${channel} queue for ${recipientPhone || recipientEmail}`,
    );

    return true;
  }

  private async handleBulkNotification(job: Job<NotificationJobData>): Promise<number> {
    // Este job recebe uma lista de notificações para processar
    // Por enquanto, processamos individualmente
    this.logger.log(`Processing bulk notification job ${job.id}`);

    // Criar jobs individuais para cada notificação
    await this.queuesService.addNotificationJob(
      NOTIFICATION_JOBS.SEND_NOTIFICATION,
      job.data,
    );

    return 1;
  }

  private async handleProcessScheduled(job: Job<NotificationJobData>): Promise<number> {
    const { tenantId } = job.data;

    await job.updateProgress(10);

    // Buscar notificações agendadas que precisam ser enviadas
    const scheduledNotifications = await this.prisma.notification.findMany({
      where: {
        tenantId,
        status: NotificationStatus.SCHEDULED,
        scheduledAt: {
          lte: new Date(),
        },
      },
      take: 100, // Processar em lotes de 100
    });

    await job.updateProgress(30);

    if (scheduledNotifications.length === 0) {
      this.logger.debug(`No scheduled notifications to process for tenant ${tenantId}`);
      return 0;
    }

    // Criar jobs para cada notificação agendada
    let processed = 0;
    for (const notification of scheduledNotifications) {
      try {
        await this.queuesService.addNotificationJob(NOTIFICATION_JOBS.SEND_NOTIFICATION, {
          tenantId,
          notificationId: notification.id,
          recipientType: notification.recipientType,
          recipientId: notification.recipientId,
          recipientName: notification.recipientName || undefined,
          recipientPhone: notification.recipientPhone || undefined,
          recipientEmail: notification.recipientEmail || undefined,
          channel: notification.channel as any,
          subject: notification.subject || undefined,
          content: notification.content,
        });
        processed++;
      } catch (error) {
        this.logger.error(
          `Failed to queue scheduled notification ${notification.id}: ${error.message}`,
        );
      }

      // Atualizar progresso
      await job.updateProgress(30 + (processed / scheduledNotifications.length) * 70);
    }

    this.logger.log(
      `Processed ${processed}/${scheduledNotifications.length} scheduled notifications for tenant ${tenantId}`,
    );

    return processed;
  }

  private async updateNotificationStatus(
    notificationId: string,
    status: NotificationStatus,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const updateData: any = { status };

      switch (status) {
        case NotificationStatus.SENT:
          updateData.sentAt = new Date();
          break;
        case NotificationStatus.DELIVERED:
          updateData.deliveredAt = new Date();
          break;
        case NotificationStatus.FAILED:
          updateData.failedAt = new Date();
          updateData.errorMessage = errorMessage;
          break;
      }

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: updateData,
      });
    } catch (error) {
      this.logger.error(
        `Failed to update notification status ${notificationId}: ${error.message}`,
      );
    }
  }
}
