import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  SendNotificationDto,
  SendBulkNotificationDto,
  SendAppointmentReminderDto,
  ConfigureWhatsAppDto,
  UpdateWhatsAppConfigDto,
  QueryTemplatesDto,
  QueryNotificationsDto,
} from './dto';
import {
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  RecipientType,
  WhatsAppProvider,
  Prisma,
} from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly CACHE_PREFIX = 'notifications';
  private readonly CACHE_TTL = 300;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  async findAllTemplates(tenantId: string, query?: QueryTemplatesDto) {
    const where: Prisma.NotificationTemplateWhereInput = { tenantId };

    if (query?.type) {
      where.type = query.type;
    }

    if (query?.channel) {
      where.channel = query.channel;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return this.prisma.notificationTemplate.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findTemplateById(id: string, tenantId: string) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: { id, tenantId },
    });

    if (!template) {
      throw new NotFoundException('Template não encontrado');
    }

    return template;
  }

  async createTemplate(tenantId: string, dto: CreateTemplateDto) {
    // Extrair variáveis do conteúdo se não fornecidas
    const variables = dto.variables || this.extractVariables(dto.content);

    const template = await this.prisma.notificationTemplate.create({
      data: {
        tenantId,
        ...dto,
        variables,
      },
    });

    await this.invalidateCache(tenantId);
    return template;
  }

  async updateTemplate(id: string, tenantId: string, dto: UpdateTemplateDto) {
    const template = await this.findTemplateById(id, tenantId);

    if (template.isSystem) {
      throw new BadRequestException('Templates do sistema não podem ser editados');
    }

    const updateData: Prisma.NotificationTemplateUpdateInput = { ...dto };
    if (dto.content) {
      updateData.variables = dto.variables || this.extractVariables(dto.content);
    }

    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data: updateData,
    });

    await this.invalidateCache(tenantId);
    return updated;
  }

  async deleteTemplate(id: string, tenantId: string) {
    const template = await this.findTemplateById(id, tenantId);

    if (template.isSystem) {
      throw new BadRequestException('Templates do sistema não podem ser excluídos');
    }

    await this.prisma.notificationTemplate.delete({ where: { id } });
    await this.invalidateCache(tenantId);

    return { message: 'Template excluído com sucesso' };
  }

  // ============================================================================
  // NOTIFICATIONS - Envio
  // ============================================================================

  async sendNotification(tenantId: string, dto: SendNotificationDto) {
    // Buscar destinatário
    const recipient = await this.getRecipient(
      tenantId,
      dto.recipientType,
      dto.recipientId,
    );

    // Buscar template se especificado
    let content = dto.customContent || '';
    let subject: string | null = null;

    if (dto.templateId) {
      const template = await this.findTemplateById(dto.templateId, tenantId);
      content = this.replaceVariables(template.content, dto.variables || {});
      subject = template.subject
        ? this.replaceVariables(template.subject, dto.variables || {})
        : null;
    } else if (!dto.customContent) {
      // Buscar template padrão pelo tipo
      const defaultTemplate = await this.prisma.notificationTemplate.findFirst({
        where: {
          tenantId,
          type: dto.type,
          channel: dto.channel || NotificationChannel.WHATSAPP,
          isActive: true,
        },
      });

      if (defaultTemplate) {
        content = this.replaceVariables(defaultTemplate.content, dto.variables || {});
        subject = defaultTemplate.subject
          ? this.replaceVariables(defaultTemplate.subject, dto.variables || {})
          : null;
      }
    }

    if (!content) {
      throw new BadRequestException('Conteúdo da notificação não definido');
    }

    // Criar notificação
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        templateId: dto.templateId,
        recipientType: dto.recipientType,
        recipientId: dto.recipientId,
        recipientName: recipient.name,
        recipientPhone: recipient.phone,
        recipientEmail: recipient.email,
        channel: dto.channel || NotificationChannel.WHATSAPP,
        subject,
        content,
        appointmentId: dto.appointmentId,
        leadId: dto.leadId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: dto.scheduledAt
          ? NotificationStatus.SCHEDULED
          : NotificationStatus.PENDING,
      },
    });

    // Enviar imediatamente se não for agendado
    if (!dto.scheduledAt) {
      await this.processNotification(notification.id, tenantId);
    }

    return notification;
  }

  async sendBulkNotification(tenantId: string, dto: SendBulkNotificationDto) {
    const results: any[] = [];

    for (const recipientId of dto.recipientIds) {
      try {
        const notification = await this.sendNotification(tenantId, {
          type: dto.type,
          channel: dto.channel,
          templateId: dto.templateId,
          recipientType: dto.recipientType,
          recipientId,
          variables: dto.variables,
        });
        results.push({ recipientId, status: 'success', notificationId: notification.id });
      } catch (error) {
        results.push({ recipientId, status: 'error', error: error.message });
      }
    }

    return {
      total: dto.recipientIds.length,
      success: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'error').length,
      results,
    };
  }

  async sendAppointmentReminder(tenantId: string, dto: SendAppointmentReminderDto) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: dto.appointmentId, tenantId },
      include: {
        client: true,
        service: true,
        provider: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    const variables = {
      nome: appointment.client.name,
      data: this.formatDate(appointment.date),
      hora: appointment.startTime,
      servico: appointment.service.name,
      profissional: appointment.provider.name,
    };

    return this.sendNotification(tenantId, {
      type: NotificationType.APPOINTMENT_REMINDER,
      channel: NotificationChannel.WHATSAPP,
      recipientType: RecipientType.CLIENT,
      recipientId: appointment.clientId,
      appointmentId: appointment.id,
      variables,
    });
  }

  async sendAppointmentConfirmation(tenantId: string, appointmentId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        client: true,
        service: true,
        provider: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    const variables = {
      nome: appointment.client.name,
      data: this.formatDate(appointment.date),
      hora: appointment.startTime,
      servico: appointment.service.name,
      profissional: appointment.provider.name,
    };

    return this.sendNotification(tenantId, {
      type: NotificationType.APPOINTMENT_CONFIRMATION,
      channel: NotificationChannel.WHATSAPP,
      recipientType: RecipientType.CLIENT,
      recipientId: appointment.clientId,
      appointmentId: appointment.id,
      variables,
    });
  }

  // ============================================================================
  // NOTIFICATIONS - Consulta
  // ============================================================================

  async findAllNotifications(tenantId: string, query?: QueryNotificationsDto) {
    const where: Prisma.NotificationWhereInput = { tenantId };

    if (query?.channel) {
      where.channel = query.channel;
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.recipientType) {
      where.recipientType = query.recipientType;
    }

    if (query?.recipientId) {
      where.recipientId = query.recipientId;
    }

    if (query?.appointmentId) {
      where.appointmentId = query.appointmentId;
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

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: {
          template: {
            select: { id: true, name: true, type: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findNotificationById(id: string, tenantId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId },
      include: {
        template: true,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notificação não encontrada');
    }

    return notification;
  }

  // ============================================================================
  // WHATSAPP CONFIG
  // ============================================================================

  async getWhatsAppConfig(tenantId: string) {
    const config = await this.prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      return null;
    }

    // Esconder credenciais sensíveis
    return {
      ...config,
      apiKey: config.apiKey ? '********' : null,
      apiSecret: config.apiSecret ? '********' : null,
      webhookSecret: config.webhookSecret ? '********' : null,
    };
  }

  async configureWhatsApp(tenantId: string, dto: ConfigureWhatsAppDto) {
    const existing = await this.prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    });

    if (existing) {
      return this.prisma.whatsAppConfig.update({
        where: { tenantId },
        data: dto,
      });
    }

    return this.prisma.whatsAppConfig.create({
      data: {
        tenantId,
        ...dto,
      },
    });
  }

  async updateWhatsAppConfig(tenantId: string, dto: UpdateWhatsAppConfigDto) {
    const existing = await this.prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Configuração WhatsApp não encontrada');
    }

    return this.prisma.whatsAppConfig.update({
      where: { tenantId },
      data: dto,
    });
  }

  async testWhatsAppConnection(tenantId: string) {
    const config = await this.prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      throw new NotFoundException('Configuração WhatsApp não encontrada');
    }

    // TODO: Implementar teste de conexão real com o provedor
    // Por agora, apenas simula
    const isConnected = !!config.apiKey && !!config.phoneNumber;

    await this.prisma.whatsAppConfig.update({
      where: { tenantId },
      data: {
        isConnected,
        lastConnectedAt: isConnected ? new Date() : null,
      },
    });

    return {
      isConnected,
      provider: config.provider,
      phoneNumber: config.phoneNumber,
    };
  }

  // ============================================================================
  // PROCESSAMENTO E ENVIO
  // ============================================================================

  private async processNotification(notificationId: string, tenantId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) return;

    // Atualizar status para enviando
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.SENDING },
    });

    try {
      // Enviar baseado no canal
      if (notification.channel === NotificationChannel.WHATSAPP) {
        await this.sendWhatsAppMessage(tenantId, notification);
      } else if (notification.channel === NotificationChannel.EMAIL) {
        // TODO: Implementar envio de email
      }

      // Atualizar status para enviado
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      // Atualizar status para falhou
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.FAILED,
          failedAt: new Date(),
          errorMessage: error.message,
        },
      });
    }
  }

  private async sendWhatsAppMessage(
    tenantId: string,
    notification: { recipientPhone: string | null; content: string },
  ) {
    const config = await this.prisma.whatsAppConfig.findUnique({
      where: { tenantId },
    });

    if (!config || !config.isActive) {
      throw new Error('WhatsApp não configurado ou inativo');
    }

    if (!notification.recipientPhone) {
      throw new Error('Número de telefone do destinatário não informado');
    }

    // TODO: Implementar integração real com provedores
    // Esta é uma implementação de exemplo para Evolution API
    switch (config.provider) {
      case WhatsAppProvider.EVOLUTION_API:
        await this.sendViaEvolutionAPI(config, notification);
        break;
      case WhatsAppProvider.META_CLOUD_API:
        await this.sendViaMetaAPI(config, notification);
        break;
      default:
        throw new Error(`Provedor ${config.provider} não suportado`);
    }
  }

  private async sendViaEvolutionAPI(
    config: { apiKey: string | null; instanceId: string | null },
    notification: { recipientPhone: string | null; content: string },
  ) {
    // TODO: Implementar chamada real para Evolution API
    // Exemplo:
    // const response = await fetch(`${config.apiUrl}/message/sendText/${config.instanceId}`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'apikey': config.apiKey,
    //   },
    //   body: JSON.stringify({
    //     number: notification.recipientPhone,
    //     text: notification.content,
    //   }),
    // });
    console.log(`[Evolution API] Enviando para ${notification.recipientPhone}: ${notification.content}`);
  }

  private async sendViaMetaAPI(
    config: { apiKey: string | null; phoneNumberId: string | null },
    notification: { recipientPhone: string | null; content: string },
  ) {
    // TODO: Implementar chamada real para Meta Cloud API
    console.log(`[Meta API] Enviando para ${notification.recipientPhone}: ${notification.content}`);
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getNotificationStats(tenantId: string, startDate?: string, endDate?: string) {
    const where: Prisma.NotificationWhereInput = { tenantId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
      }
    }

    const [total, byStatus, byChannel] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.notification.groupBy({
        by: ['channel'],
        where,
        _count: true,
      }),
    ]);

    const sent = byStatus.find((s) => s.status === NotificationStatus.SENT)?._count || 0;
    const delivered = byStatus.find((s) => s.status === NotificationStatus.DELIVERED)?._count || 0;
    const read = byStatus.find((s) => s.status === NotificationStatus.READ)?._count || 0;
    const failed = byStatus.find((s) => s.status === NotificationStatus.FAILED)?._count || 0;

    return {
      total,
      sent,
      delivered,
      read,
      failed,
      deliveryRate: sent > 0 ? Number(((delivered / sent) * 100).toFixed(2)) : 0,
      readRate: delivered > 0 ? Number(((read / delivered) * 100).toFixed(2)) : 0,
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
      byChannel: byChannel.map((c) => ({ channel: c.channel, count: c._count })),
    };
  }

  // ============================================================================
  // TEMPLATES PADRÃO
  // ============================================================================

  async createDefaultTemplates(tenantId: string) {
    const defaultTemplates = [
      {
        name: 'Confirmação de Agendamento',
        type: NotificationType.APPOINTMENT_CONFIRMATION,
        channel: NotificationChannel.WHATSAPP,
        content: `Olá {{nome}}! 👋

Seu agendamento foi confirmado:

📅 Data: {{data}}
🕐 Horário: {{hora}}
💆 Serviço: {{servico}}
👤 Profissional: {{profissional}}

Aguardamos você! 😊`,
        variables: ['nome', 'data', 'hora', 'servico', 'profissional'],
        isSystem: true,
      },
      {
        name: 'Lembrete de Agendamento',
        type: NotificationType.APPOINTMENT_REMINDER,
        channel: NotificationChannel.WHATSAPP,
        content: `Olá {{nome}}! 👋

Lembramos que você tem um agendamento amanhã:

📅 Data: {{data}}
🕐 Horário: {{hora}}
💆 Serviço: {{servico}}
👤 Profissional: {{profissional}}

Confirme sua presença respondendo esta mensagem! 😊`,
        variables: ['nome', 'data', 'hora', 'servico', 'profissional'],
        isSystem: true,
      },
      {
        name: 'Agendamento Cancelado',
        type: NotificationType.APPOINTMENT_CANCELLED,
        channel: NotificationChannel.WHATSAPP,
        content: `Olá {{nome}},

Informamos que seu agendamento foi cancelado:

📅 Data: {{data}}
🕐 Horário: {{hora}}
💆 Serviço: {{servico}}

Entre em contato para reagendar! 📞`,
        variables: ['nome', 'data', 'hora', 'servico'],
        isSystem: true,
      },
    ];

    for (const template of defaultTemplates) {
      await this.prisma.notificationTemplate.upsert({
        where: {
          tenantId_name_type: {
            tenantId,
            name: template.name,
            type: template.type,
          },
        },
        update: {},
        create: {
          tenantId,
          ...template,
        },
      });
    }

    return { message: 'Templates padrão criados com sucesso' };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async getRecipient(
    tenantId: string,
    type: RecipientType,
    id: string,
  ): Promise<{ name: string; phone: string | null; email: string | null }> {
    switch (type) {
      case RecipientType.CLIENT:
        const client = await this.prisma.client.findFirst({
          where: { id, tenantId, deletedAt: null },
        });
        if (!client) throw new NotFoundException('Cliente não encontrado');
        return { name: client.name, phone: client.phone, email: client.email };

      case RecipientType.PROVIDER:
        const provider = await this.prisma.provider.findFirst({
          where: { id, tenantId, deletedAt: null },
        });
        if (!provider) throw new NotFoundException('Profissional não encontrado');
        return { name: provider.name, phone: provider.phone, email: null };

      case RecipientType.LEAD:
        const lead = await this.prisma.lead.findFirst({
          where: { id, tenantId },
        });
        if (!lead) throw new NotFoundException('Lead não encontrado');
        return {
          name: lead.name,
          phone: lead.phone || lead.whatsapp,
          email: lead.email,
        };

      case RecipientType.USER:
        const user = await this.prisma.user.findFirst({
          where: { id, tenantId },
        });
        if (!user) throw new NotFoundException('Usuário não encontrado');
        return { name: user.name, phone: user.phone, email: user.email };

      default:
        throw new BadRequestException('Tipo de destinatário inválido');
    }
  }

  private extractVariables(content: string): string[] {
    const regex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    return variables;
  }

  private replaceVariables(
    content: string,
    variables: Record<string, string>,
  ): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  private async invalidateCache(tenantId: string) {
    const pattern = `${this.CACHE_PREFIX}:${tenantId}:*`;
    await this.redis.delByPattern(pattern);
  }
}
