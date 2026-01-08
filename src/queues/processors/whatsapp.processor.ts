import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QueuesService } from '../queues.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES, WHATSAPP_JOBS, WhatsAppJobData } from '../queues.constants';
import { WhatsAppProvider, NotificationStatus } from '@prisma/client';

@Injectable()
export class WhatsAppProcessor implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppProcessor.name);

  constructor(
    private queuesService: QueuesService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    this.queuesService.registerWorker(
      QUEUE_NAMES.WHATSAPP,
      this.process.bind(this),
      { concurrency: 2 }, // Limitar concorrência para respeitar rate limits
    );
    this.logger.log('WhatsApp processor initialized');
  }

  async process(job: Job<WhatsAppJobData>): Promise<any> {
    this.logger.debug(`Processing WhatsApp job ${job.id}: ${job.name}`);

    const { data } = job;

    try {
      switch (job.name) {
        case WHATSAPP_JOBS.SEND_MESSAGE:
          return this.handleSendMessage(job);

        case WHATSAPP_JOBS.SEND_TEMPLATE:
          return this.handleSendTemplate(job);

        case WHATSAPP_JOBS.SEND_MEDIA:
          return this.handleSendMedia(job);

        default:
          this.logger.warn(`Unknown WhatsApp job type: ${job.name}`);
          return this.handleSendMessage(job);
      }
    } catch (error) {
      this.logger.error(`WhatsApp job ${job.id} failed: ${error.message}`);

      // Atualizar status da notificação se existir
      if (data.notificationId) {
        await this.updateNotificationStatus(data.notificationId, error.message);
      }

      throw error;
    }
  }

  private async handleSendMessage(job: Job<WhatsAppJobData>): Promise<boolean> {
    const { tenantId, to, message, notificationId } = job.data;

    await job.updateProgress(10);

    // Buscar configuração do WhatsApp do tenant
    const config = await this.getWhatsAppConfig(tenantId);
    if (!config) {
      throw new Error('WhatsApp not configured for this tenant');
    }

    if (!config.isActive || !config.isConnected) {
      throw new Error('WhatsApp is not active or connected');
    }

    await job.updateProgress(30);

    // Enviar mensagem baseado no provider
    let success = false;
    switch (config.provider) {
      case WhatsAppProvider.EVOLUTION_API:
        success = await this.sendViaEvolutionAPI(config, to, message || '');
        break;

      case WhatsAppProvider.META_CLOUD_API:
        success = await this.sendViaMetaAPI(config, to, message || '');
        break;

      case WhatsAppProvider.TWILIO:
        success = await this.sendViaTwilio(config, to, message || '');
        break;

      default:
        throw new Error(`Unsupported WhatsApp provider: ${config.provider}`);
    }

    await job.updateProgress(90);

    // Atualizar status da notificação se existir
    if (notificationId && success) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });
    }

    await job.updateProgress(100);

    this.logger.log(`WhatsApp message sent to ${to} via ${config.provider}`);

    return success;
  }

  private async handleSendTemplate(job: Job<WhatsAppJobData>): Promise<boolean> {
    const { tenantId, to, templateName, templateParams, notificationId } = job.data;

    await job.updateProgress(10);

    const config = await this.getWhatsAppConfig(tenantId);
    if (!config) {
      throw new Error('WhatsApp not configured for this tenant');
    }

    await job.updateProgress(30);

    // Para templates, geralmente usamos a Meta Cloud API
    if (config.provider !== WhatsAppProvider.META_CLOUD_API) {
      // Fallback: converter template para mensagem simples
      const message = this.templateToMessage(templateName || '', templateParams || {});
      return this.handleSendMessage({
        ...job,
        data: { ...job.data, message },
      } as Job<WhatsAppJobData>);
    }

    const success = await this.sendTemplateViaMetaAPI(
      config,
      to,
      templateName || '',
      templateParams || {},
    );

    await job.updateProgress(90);

    if (notificationId && success) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });
    }

    await job.updateProgress(100);

    return success;
  }

  private async handleSendMedia(job: Job<WhatsAppJobData>): Promise<boolean> {
    const { tenantId, to, mediaUrl, mediaType, message, notificationId } = job.data;

    await job.updateProgress(10);

    const config = await this.getWhatsAppConfig(tenantId);
    if (!config) {
      throw new Error('WhatsApp not configured for this tenant');
    }

    await job.updateProgress(30);

    let success = false;
    switch (config.provider) {
      case WhatsAppProvider.EVOLUTION_API:
        success = await this.sendMediaViaEvolutionAPI(
          config,
          to,
          mediaUrl || '',
          mediaType || 'image',
          message,
        );
        break;

      case WhatsAppProvider.META_CLOUD_API:
        success = await this.sendMediaViaMetaAPI(
          config,
          to,
          mediaUrl || '',
          mediaType || 'image',
          message,
        );
        break;

      default:
        throw new Error(`Media sending not supported for provider: ${config.provider}`);
    }

    await job.updateProgress(90);

    if (notificationId && success) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.DELIVERED,
          deliveredAt: new Date(),
        },
      });
    }

    await job.updateProgress(100);

    return success;
  }

  // ============================================================================
  // PROVIDER IMPLEMENTATIONS
  // ============================================================================

  private async sendViaEvolutionAPI(
    config: any,
    to: string,
    message: string,
  ): Promise<boolean> {
    const baseUrl = config.apiUrl || this.configService.get('EVOLUTION_API_URL');
    const instanceId = config.instanceId;
    const apiKey = config.apiKey;

    if (!baseUrl || !instanceId || !apiKey) {
      throw new Error('Evolution API configuration incomplete');
    }

    try {
      const response = await fetch(`${baseUrl}/message/sendText/${instanceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify({
          number: this.formatPhoneNumber(to),
          text: message,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Evolution API error: ${error}`);
      }

      const result = await response.json();
      this.logger.debug(`Evolution API response: ${JSON.stringify(result)}`);

      return true;
    } catch (error) {
      this.logger.error(`Evolution API error: ${error.message}`);
      throw error;
    }
  }

  private async sendViaMetaAPI(
    config: any,
    to: string,
    message: string,
  ): Promise<boolean> {
    const accessToken = config.apiKey;
    const phoneNumberId = config.phoneNumberId;

    if (!accessToken || !phoneNumberId) {
      throw new Error('Meta Cloud API configuration incomplete');
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatPhoneNumber(to),
            type: 'text',
            text: { body: message },
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Meta API error: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      this.logger.debug(`Meta API response: ${JSON.stringify(result)}`);

      return true;
    } catch (error) {
      this.logger.error(`Meta API error: ${error.message}`);
      throw error;
    }
  }

  private async sendViaTwilio(
    config: any,
    to: string,
    message: string,
  ): Promise<boolean> {
    const accountSid = config.apiKey;
    const authToken = config.apiSecret;
    const fromNumber = config.phoneNumber;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio configuration incomplete');
    }

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            From: `whatsapp:${fromNumber}`,
            To: `whatsapp:${this.formatPhoneNumber(to)}`,
            Body: message,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Twilio error: ${JSON.stringify(error)}`);
      }

      const result = await response.json();
      this.logger.debug(`Twilio response: ${JSON.stringify(result)}`);

      return true;
    } catch (error) {
      this.logger.error(`Twilio error: ${error.message}`);
      throw error;
    }
  }

  private async sendTemplateViaMetaAPI(
    config: any,
    to: string,
    templateName: string,
    params: Record<string, string>,
  ): Promise<boolean> {
    const accessToken = config.apiKey;
    const phoneNumberId = config.phoneNumberId;

    if (!accessToken || !phoneNumberId) {
      throw new Error('Meta Cloud API configuration incomplete');
    }

    // Converter params para formato da Meta API
    const components: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }> = [];
    if (Object.keys(params).length > 0) {
      components.push({
        type: 'body',
        parameters: Object.values(params).map((value) => ({
          type: 'text',
          text: value,
        })),
      });
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatPhoneNumber(to),
            type: 'template',
            template: {
              name: templateName,
              language: { code: 'pt_BR' },
              components,
            },
          }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Meta API template error: ${JSON.stringify(error)}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Meta API template error: ${error.message}`);
      throw error;
    }
  }

  private async sendMediaViaEvolutionAPI(
    config: any,
    to: string,
    mediaUrl: string,
    mediaType: string,
    caption?: string,
  ): Promise<boolean> {
    const baseUrl = config.apiUrl || this.configService.get('EVOLUTION_API_URL');
    const instanceId = config.instanceId;
    const apiKey = config.apiKey;

    try {
      const endpoint = mediaType === 'document' ? 'sendDocument' : 'sendMedia';
      const response = await fetch(`${baseUrl}/message/${endpoint}/${instanceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify({
          number: this.formatPhoneNumber(to),
          mediatype: mediaType,
          media: mediaUrl,
          caption,
        }),
      });

      if (!response.ok) {
        throw new Error(`Evolution API media error: ${await response.text()}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Evolution API media error: ${error.message}`);
      throw error;
    }
  }

  private async sendMediaViaMetaAPI(
    config: any,
    to: string,
    mediaUrl: string,
    mediaType: string,
    caption?: string,
  ): Promise<boolean> {
    const accessToken = config.apiKey;
    const phoneNumberId = config.phoneNumberId;

    try {
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatPhoneNumber(to),
            type: mediaType,
            [mediaType]: {
              link: mediaUrl,
              caption,
            },
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Meta API media error: ${JSON.stringify(await response.json())}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Meta API media error: ${error.message}`);
      throw error;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getWhatsAppConfig(tenantId: string) {
    return this.prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    });
  }

  private formatPhoneNumber(phone: string): string {
    // Remove todos os caracteres não numéricos
    let cleaned = phone.replace(/\D/g, '');

    // Se não começar com código do país, adicionar +55 (Brasil)
    if (!cleaned.startsWith('55') && cleaned.length <= 11) {
      cleaned = '55' + cleaned;
    }

    return cleaned;
  }

  private templateToMessage(
    templateName: string,
    params: Record<string, string>,
  ): string {
    // Fallback simples para quando o provider não suporta templates
    let message = `[${templateName}]`;
    for (const [key, value] of Object.entries(params)) {
      message += `\n${key}: ${value}`;
    }
    return message;
  }

  private async updateNotificationStatus(
    notificationId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
          errorMessage,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update notification status ${notificationId}: ${error.message}`,
      );
    }
  }
}
