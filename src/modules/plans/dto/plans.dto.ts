import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsArray,
  IsUUID,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PlanType, BillingCycle, SubscriptionStatus } from '@prisma/client';

// ============================================================================
// DTOs para Plan
// ============================================================================

export class CreatePlanDto {
  @IsEnum(PlanType)
  code: PlanType;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  monthlyPrice: number;

  @IsNumber()
  @Min(0)
  yearlyPrice: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsInt()
  @Min(0)
  @Max(90)
  @IsOptional()
  trialDays?: number;

  @IsInt()
  @IsOptional()
  displayOrder?: number;

  @IsBoolean()
  @IsOptional()
  isPopular?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}

export class UpdatePlanDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  yearlyPrice?: number;

  @IsInt()
  @Min(0)
  @Max(90)
  @IsOptional()
  trialDays?: number;

  @IsInt()
  @IsOptional()
  displayOrder?: number;

  @IsBoolean()
  @IsOptional()
  isPopular?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  // IDs externos
  @IsString()
  @IsOptional()
  stripeMonthlyPriceId?: string;

  @IsString()
  @IsOptional()
  stripeYearlyPriceId?: string;

  @IsString()
  @IsOptional()
  mercadoPagoMonthlyId?: string;

  @IsString()
  @IsOptional()
  mercadoPagoYearlyId?: string;
}

// ============================================================================
// DTOs para PlanLimit
// ============================================================================

export class CreatePlanLimitDto {
  @IsInt()
  @Min(-1)
  @IsOptional()
  maxUsers?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  maxProviders?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  maxClients?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  maxAppointments?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  maxServices?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  maxProducts?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  storageGB?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  maxCampaigns?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  maxWebhooks?: number;

  @IsInt()
  @Min(-1)
  @IsOptional()
  maxTemplates?: number;

  @IsInt()
  @Min(30)
  @IsOptional()
  dataRetentionDays?: number;
}

export class UpdatePlanLimitDto extends CreatePlanLimitDto {}

// ============================================================================
// DTOs para PlanFeature
// ============================================================================

export class CreatePlanFeatureDto {
  @IsString()
  @IsNotEmpty()
  featureCode: string;

  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsInt()
  @IsOptional()
  displayOrder?: number;
}

export class UpdatePlanFeatureDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @IsObject()
  @IsOptional()
  config?: Record<string, any>;

  @IsInt()
  @IsOptional()
  displayOrder?: number;
}

// ============================================================================
// DTOs para Plano Completo (com limites e features)
// ============================================================================

export class CreateFullPlanDto {
  @ValidateNested()
  @Type(() => CreatePlanDto)
  plan: CreatePlanDto;

  @ValidateNested()
  @Type(() => CreatePlanLimitDto)
  @IsOptional()
  limits?: CreatePlanLimitDto;

  @ValidateNested({ each: true })
  @Type(() => CreatePlanFeatureDto)
  @IsArray()
  @IsOptional()
  features?: CreatePlanFeatureDto[];
}

// ============================================================================
// DTOs para Subscription
// ============================================================================

export class SubscribePlanDto {
  @IsEnum(PlanType)
  planCode: PlanType;

  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;

  @IsString()
  @IsOptional()
  couponCode?: string;

  // Dados de pagamento
  @IsString()
  @IsOptional()
  paymentMethodId?: string;
}

export class ChangePlanDto {
  @IsEnum(PlanType)
  newPlanCode: PlanType;

  @IsBoolean()
  @IsOptional()
  immediate?: boolean; // Aplicar imediatamente ou no próximo ciclo

  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;
}

export class CancelSubscriptionDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsBoolean()
  @IsOptional()
  immediate?: boolean; // Cancelar imediatamente ou no fim do período
}

export class ReactivateSubscriptionDto {
  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;

  @IsString()
  @IsOptional()
  paymentMethodId?: string;
}

// ============================================================================
// DTOs de Query
// ============================================================================

export class QueryPlansDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  includeFeatures?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  includeLimits?: boolean;
}

// ============================================================================
// DTOs para Verificação de Limites
// ============================================================================

export class CheckLimitDto {
  @IsString()
  @IsNotEmpty()
  resource: string; // users, providers, clients, appointments, etc

  @IsInt()
  @Min(0)
  @IsOptional()
  quantity?: number; // Quantidade a adicionar (default 1)
}

export class CheckFeatureDto {
  @IsString()
  @IsNotEmpty()
  featureCode: string;
}

// ============================================================================
// DTOs para Cupons
// ============================================================================

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxUses?: number; // 0 = ilimitado

  @IsString()
  @IsOptional()
  validUntil?: string; // ISO date

  @IsArray()
  @IsOptional()
  @IsEnum(PlanType, { each: true })
  applicablePlans?: PlanType[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ValidateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsEnum(PlanType)
  planCode: PlanType;
}

// ============================================================================
// DTOs de Resposta
// ============================================================================

export class PlanResponseDto {
  id: string;
  code: PlanType;
  name: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  trialDays: number;
  displayOrder: number;
  isPopular: boolean;
  isActive: boolean;
  isPublic: boolean;
  limits?: PlanLimitResponseDto;
  features?: PlanFeatureResponseDto[];
}

export class PlanLimitResponseDto {
  maxUsers: number;
  maxProviders: number;
  maxClients: number;
  maxAppointments: number;
  maxServices: number;
  maxProducts: number;
  storageGB: number;
  maxCampaigns: number;
  maxWebhooks: number;
  maxTemplates: number;
  dataRetentionDays: number;
}

export class PlanFeatureResponseDto {
  featureCode: string;
  displayName: string;
  isEnabled: boolean;
  config?: Record<string, any>;
}

export class SubscriptionResponseDto {
  id: string;
  plan: PlanResponseDto;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  amount: number;
  discount?: number;
  couponCode?: string;
  trialEnd?: Date;
  scheduledPlan?: PlanResponseDto;
  scheduledChange?: Date;
}

export class UsageResponseDto {
  resource: string;
  current: number;
  limit: number; // -1 = unlimited
  percentage: number; // 0-100 (null if unlimited)
  isAtLimit: boolean;
}

export class AllUsageResponseDto {
  subscription: SubscriptionResponseDto;
  usage: UsageResponseDto[];
  features: {
    code: string;
    name: string;
    isEnabled: boolean;
  }[];
}

export class LimitCheckResponseDto {
  allowed: boolean;
  resource: string;
  current: number;
  limit: number;
  remaining: number; // -1 = unlimited
  message?: string;
}

export class FeatureCheckResponseDto {
  allowed: boolean;
  featureCode: string;
  message?: string;
}

export class CouponValidationResponseDto {
  valid: boolean;
  code: string;
  discountPercent?: number;
  originalPrice?: number;
  discountedPrice?: number;
  message?: string;
}

export class PlanComparisonDto {
  plans: PlanResponseDto[];
  features: {
    code: string;
    name: string;
    availability: { [planCode: string]: boolean };
  }[];
  limits: {
    name: string;
    values: { [planCode: string]: number | string }; // number or "Unlimited"
  }[];
}
