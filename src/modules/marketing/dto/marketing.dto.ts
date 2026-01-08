import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsArray,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsUrl,
} from 'class-validator';
import {
  CampaignPlatform,
  CampaignType,
  CampaignStatus,
  SocialPlatform,
  PostStatus,
} from '@prisma/client';

// ============================================================================
// DTOs para MarketingCampaign
// ============================================================================

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome da campanha é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(CampaignPlatform, { message: 'Plataforma inválida' })
  platform: CampaignPlatform;

  @IsEnum(CampaignType, { message: 'Tipo de campanha inválido' })
  @IsOptional()
  type?: CampaignType;

  @IsDateString({}, { message: 'Data de início inválida' })
  startDate: string;

  @IsDateString({}, { message: 'Data de fim inválida' })
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  budget?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  dailyBudget?: number;

  @IsString()
  @IsOptional()
  utmSource?: string;

  @IsString()
  @IsOptional()
  utmMedium?: string;

  @IsString()
  @IsOptional()
  utmCampaign?: string;

  @IsString()
  @IsOptional()
  utmContent?: string;

  @IsUrl({}, { message: 'URL de rastreamento inválida' })
  @IsOptional()
  trackingUrl?: string;

  @IsEnum(CampaignStatus, { message: 'Status inválido' })
  @IsOptional()
  status?: CampaignStatus;
}

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(CampaignPlatform, { message: 'Plataforma inválida' })
  @IsOptional()
  platform?: CampaignPlatform;

  @IsEnum(CampaignType, { message: 'Tipo de campanha inválido' })
  @IsOptional()
  type?: CampaignType;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  budget?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  dailyBudget?: number;

  @IsString()
  @IsOptional()
  utmSource?: string;

  @IsString()
  @IsOptional()
  utmMedium?: string;

  @IsString()
  @IsOptional()
  utmCampaign?: string;

  @IsString()
  @IsOptional()
  utmContent?: string;

  @IsUrl()
  @IsOptional()
  trackingUrl?: string;

  @IsEnum(CampaignStatus, { message: 'Status inválido' })
  @IsOptional()
  status?: CampaignStatus;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCampaignMetricsDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  impressions?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  clicks?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  conversions?: number;
}

// ============================================================================
// DTOs para CampaignExpense
// ============================================================================

export class CreateCampaignExpenseDto {
  @IsDateString({}, { message: 'Data inválida' })
  date: string;

  @IsNumber({}, { message: 'Valor deve ser um número' })
  @Min(0.01, { message: 'Valor deve ser maior que zero' })
  amount: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  impressions?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  clicks?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  conversions?: number;
}

// ============================================================================
// DTOs para SocialPost
// ============================================================================

export class CreateSocialPostDto {
  @IsUUID('4', { message: 'ID da campanha inválido' })
  @IsOptional()
  campaignId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty({ message: 'Conteúdo é obrigatório' })
  content: string;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  mediaUrls?: string[];

  @IsEnum(SocialPlatform, { message: 'Plataforma inválida' })
  platform: SocialPlatform;

  @IsDateString({}, { message: 'Data de agendamento inválida' })
  @IsOptional()
  scheduledAt?: string;

  @IsEnum(PostStatus, { message: 'Status inválido' })
  @IsOptional()
  status?: PostStatus;
}

export class UpdateSocialPostDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  mediaUrls?: string[];

  @IsEnum(SocialPlatform, { message: 'Plataforma inválida' })
  @IsOptional()
  platform?: SocialPlatform;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsEnum(PostStatus, { message: 'Status inválido' })
  @IsOptional()
  status?: PostStatus;
}

export class UpdatePostMetricsDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  likes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  comments?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  shares?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  reach?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  engagement?: number;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryCampaignsDto {
  @IsEnum(CampaignPlatform)
  @IsOptional()
  platform?: CampaignPlatform;

  @IsEnum(CampaignType)
  @IsOptional()
  type?: CampaignType;

  @IsEnum(CampaignStatus)
  @IsOptional()
  status?: CampaignStatus;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

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

export class QueryPostsDto {
  @IsUUID('4')
  @IsOptional()
  campaignId?: string;

  @IsEnum(SocialPlatform)
  @IsOptional()
  platform?: SocialPlatform;

  @IsEnum(PostStatus)
  @IsOptional()
  status?: PostStatus;

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

export class MarketingReportDto {
  @IsDateString()
  @IsNotEmpty({ message: 'Data de início é obrigatória' })
  startDate: string;

  @IsDateString()
  @IsNotEmpty({ message: 'Data de fim é obrigatória' })
  endDate: string;

  @IsEnum(CampaignPlatform)
  @IsOptional()
  platform?: CampaignPlatform;
}
