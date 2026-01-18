import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsArray,
  IsDateString,
  IsObject,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MessageBlastType,
  MessageBlastStatus,
  NotificationChannel,
} from '@prisma/client';

// ============================================================================
// FILTROS DE SEGMENTAÇÃO
// ============================================================================

export class CampaignFiltersDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  inactiveDays?: number; // Clientes inativos há X dias

  @IsOptional()
  @IsInt()
  @Min(0)
  minVisits?: number; // Mínimo de visitas

  @IsOptional()
  @IsInt()
  @Min(0)
  maxVisits?: number; // Máximo de visitas

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceIds?: string[]; // Clientes que fizeram esses serviços

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  providerIds?: string[]; // Clientes atendidos por esses profissionais

  @IsOptional()
  @IsBoolean()
  birthdayThisMonth?: boolean; // Aniversariantes do mês

  @IsOptional()
  @IsBoolean()
  birthdayThisWeek?: boolean; // Aniversariantes da semana

  @IsOptional()
  @IsBoolean()
  birthdayToday?: boolean; // Aniversariantes do dia

  @IsOptional()
  @IsInt()
  @Min(0)
  minLoyaltyPoints?: number; // Mínimo de pontos de fidelidade

  @IsOptional()
  @IsBoolean()
  hasWhatsapp?: boolean; // Somente clientes com WhatsApp

  @IsOptional()
  @IsBoolean()
  hasEmail?: boolean; // Somente clientes com email

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  clientIds?: string[]; // IDs específicos de clientes
}

// ============================================================================
// CREATE CAMPAIGN
// ============================================================================

export class CreateCampaignDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(MessageBlastType)
  type: MessageBlastType;

  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  subject?: string; // Para email

  @IsString()
  content: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignFiltersDto)
  filters?: CampaignFiltersDto;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsBoolean()
  skipRecentlyContacted?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  recentContactDays?: number;
}

// ============================================================================
// UPDATE CAMPAIGN
// ============================================================================

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MessageBlastType)
  type?: MessageBlastType;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignFiltersDto)
  filters?: CampaignFiltersDto;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsBoolean()
  skipRecentlyContacted?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  recentContactDays?: number;
}

// ============================================================================
// UPDATE STATUS
// ============================================================================

export class UpdateCampaignStatusDto {
  @IsEnum(MessageBlastStatus)
  status: MessageBlastStatus;
}

// ============================================================================
// QUERY CAMPAIGNS
// ============================================================================

export class QueryCampaignsDto {
  @IsOptional()
  @IsEnum(MessageBlastType)
  type?: MessageBlastType;

  @IsOptional()
  @IsEnum(MessageBlastStatus)
  status?: MessageBlastStatus;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

// ============================================================================
// PREVIEW
// ============================================================================

export class PreviewCampaignDto {
  @IsOptional()
  @IsString()
  templateId?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignFiltersDto)
  filters?: CampaignFiltersDto;

  @IsOptional()
  @IsString()
  sampleClientId?: string; // Cliente para usar como exemplo no preview
}

// ============================================================================
// SEND CAMPAIGN
// ============================================================================

export class SendCampaignDto {
  @IsOptional()
  @IsBoolean()
  sendNow?: boolean; // Enviar imediatamente (ignora scheduledAt)

  @IsOptional()
  @IsDateString()
  scheduledAt?: string; // Agendar para este horário
}
