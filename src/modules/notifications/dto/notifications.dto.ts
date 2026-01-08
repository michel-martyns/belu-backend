import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsArray,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsPhoneNumber,
} from 'class-validator';
import {
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  RecipientType,
  WhatsAppProvider,
} from '@prisma/client';

// ============================================================================
// DTOs para NotificationTemplate
// ============================================================================

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do template é obrigatório' })
  name: string;

  @IsEnum(NotificationType, { message: 'Tipo de notificação inválido' })
  type: NotificationType;

  @IsEnum(NotificationChannel, { message: 'Canal inválido' })
  @IsOptional()
  channel?: NotificationChannel;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsNotEmpty({ message: 'Conteúdo é obrigatório' })
  content: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];
}

export class UpdateTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs para Notification
// ============================================================================

export class SendNotificationDto {
  @IsEnum(NotificationType, { message: 'Tipo de notificação inválido' })
  type: NotificationType;

  @IsEnum(NotificationChannel, { message: 'Canal inválido' })
  @IsOptional()
  channel?: NotificationChannel;

  @IsEnum(RecipientType, { message: 'Tipo de destinatário inválido' })
  recipientType: RecipientType;

  @IsUUID('4', { message: 'ID do destinatário inválido' })
  recipientId: string;

  @IsString()
  @IsOptional()
  customContent?: string; // Conteúdo customizado (ignora template)

  @IsUUID('4')
  @IsOptional()
  templateId?: string;

  @IsUUID('4')
  @IsOptional()
  appointmentId?: string;

  @IsUUID('4')
  @IsOptional()
  leadId?: string;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string; // Para agendamento de envio

  // Variáveis para substituição no template
  @IsOptional()
  variables?: Record<string, string>;
}

export class SendBulkNotificationDto {
  @IsEnum(NotificationType, { message: 'Tipo de notificação inválido' })
  type: NotificationType;

  @IsEnum(NotificationChannel, { message: 'Canal inválido' })
  @IsOptional()
  channel?: NotificationChannel;

  @IsUUID('4')
  @IsOptional()
  templateId?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  recipientIds: string[];

  @IsEnum(RecipientType, { message: 'Tipo de destinatário inválido' })
  recipientType: RecipientType;

  @IsOptional()
  variables?: Record<string, string>;
}

export class SendAppointmentReminderDto {
  @IsUUID('4', { message: 'ID do agendamento inválido' })
  appointmentId: string;

  @IsInt()
  @Min(1)
  @Max(72)
  @IsOptional()
  hoursBeforeAppointment?: number; // Horas antes do agendamento (default: 24)
}

// ============================================================================
// DTOs para WhatsAppConfig
// ============================================================================

export class ConfigureWhatsAppDto {
  @IsEnum(WhatsAppProvider, { message: 'Provedor inválido' })
  provider: WhatsAppProvider;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  apiSecret?: string;

  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  webhookSecret?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  phoneNumberId?: string;
}

export class UpdateWhatsAppConfigDto {
  @IsEnum(WhatsAppProvider, { message: 'Provedor inválido' })
  @IsOptional()
  provider?: WhatsAppProvider;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  apiSecret?: string;

  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  webhookSecret?: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  phoneNumberId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryTemplatesDto {
  @IsEnum(NotificationType)
  @IsOptional()
  type?: NotificationType;

  @IsEnum(NotificationChannel)
  @IsOptional()
  channel?: NotificationChannel;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QueryNotificationsDto {
  @IsEnum(NotificationChannel)
  @IsOptional()
  channel?: NotificationChannel;

  @IsEnum(NotificationStatus)
  @IsOptional()
  status?: NotificationStatus;

  @IsEnum(RecipientType)
  @IsOptional()
  recipientType?: RecipientType;

  @IsUUID('4')
  @IsOptional()
  recipientId?: string;

  @IsUUID('4')
  @IsOptional()
  appointmentId?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

// ============================================================================
// DTOs para Webhooks
// ============================================================================

export class WhatsAppWebhookDto {
  @IsString()
  @IsOptional()
  messageId?: string;

  @IsString()
  @IsOptional()
  status?: string; // sent, delivered, read, failed

  @IsString()
  @IsOptional()
  timestamp?: string;

  @IsString()
  @IsOptional()
  errorCode?: string;

  @IsString()
  @IsOptional()
  errorMessage?: string;
}
