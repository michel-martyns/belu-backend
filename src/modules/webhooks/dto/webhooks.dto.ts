import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  Max,
  IsEmail,
  IsObject,
  IsDateString,
} from 'class-validator';
import {
  WebhookSource,
  LeadStage,
  LeadPriority,
  WebhookLogStatus,
} from '@prisma/client';

// ============================================================================
// DTOs para WebhookEndpoint
// ============================================================================

export class CreateWebhookEndpointDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do endpoint é obrigatório' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Slug é obrigatório' })
  slug: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(WebhookSource, { message: 'Fonte inválida' })
  @IsOptional()
  source?: WebhookSource;

  // Mapeamento de campos
  @IsObject()
  @IsOptional()
  fieldMapping?: Record<string, string>;

  // Configurações de lead
  @IsEnum(LeadStage)
  @IsOptional()
  defaultStage?: LeadStage;

  @IsEnum(LeadPriority)
  @IsOptional()
  defaultPriority?: LeadPriority;

  @IsUUID('4')
  @IsOptional()
  assignToUserId?: string;

  @IsUUID('4')
  @IsOptional()
  campaignId?: string;

  // Tags automáticas
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  autoTags?: string[];

  // Notificações
  @IsBoolean()
  @IsOptional()
  notifyOnReceive?: boolean;

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  notifyEmails?: string[];
}

export class UpdateWebhookEndpointDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(WebhookSource)
  @IsOptional()
  source?: WebhookSource;

  @IsObject()
  @IsOptional()
  fieldMapping?: Record<string, string>;

  @IsEnum(LeadStage)
  @IsOptional()
  defaultStage?: LeadStage;

  @IsEnum(LeadPriority)
  @IsOptional()
  defaultPriority?: LeadPriority;

  @IsUUID('4')
  @IsOptional()
  assignToUserId?: string;

  @IsUUID('4')
  @IsOptional()
  campaignId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  autoTags?: string[];

  @IsBoolean()
  @IsOptional()
  notifyOnReceive?: boolean;

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  notifyEmails?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class RegenerateSecretDto {
  // Pode ser vazio, apenas para confirmar a ação
}

// ============================================================================
// DTOs para receber webhooks (público)
// ============================================================================

export class GenericWebhookPayloadDto {
  // Campos comuns
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  nome?: string; // Português

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  telefone?: string; // Português

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  mensagem?: string; // Português

  // Permite campos extras
  [key: string]: any;
}

export class FacebookLeadDto {
  @IsString()
  @IsOptional()
  leadgen_id?: string;

  @IsString()
  @IsOptional()
  page_id?: string;

  @IsString()
  @IsOptional()
  form_id?: string;

  @IsString()
  @IsOptional()
  ad_id?: string;

  @IsString()
  @IsOptional()
  adgroup_id?: string;

  @IsOptional()
  field_data?: Array<{ name: string; values: string[] }>;

  @IsString()
  @IsOptional()
  created_time?: string;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryWebhookEndpointsDto {
  @IsEnum(WebhookSource)
  @IsOptional()
  source?: WebhookSource;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsUUID('4')
  @IsOptional()
  campaignId?: string;
}

export class QueryWebhookLogsDto {
  @IsUUID('4')
  @IsOptional()
  endpointId?: string;

  @IsEnum(WebhookLogStatus)
  @IsOptional()
  status?: WebhookLogStatus;

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
// DTOs de Resposta
// ============================================================================

export class WebhookEndpointResponseDto {
  id: string;
  name: string;
  slug: string;
  webhookUrl: string;
  secretKey: string;
  source: WebhookSource;
  isActive: boolean;
  totalReceived: number;
  totalProcessed: number;
  totalFailed: number;
  createdAt: Date;
}

export class WebhookStatsDto {
  totalEndpoints: number;
  activeEndpoints: number;
  totalReceived: number;
  totalProcessed: number;
  totalFailed: number;
  successRate: number;
  bySource: { source: WebhookSource; count: number }[];
  recentLogs: {
    id: string;
    endpointName: string;
    status: WebhookLogStatus;
    createdAt: Date;
  }[];
}
