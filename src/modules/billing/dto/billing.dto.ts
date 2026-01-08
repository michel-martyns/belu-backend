import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsNumber,
  IsUUID,
  IsDateString,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  PlanType,
  InvoiceStatus,
  PaymentStatus,
  BillingJobType,
  JobStatus,
  DiscountType,
  ReminderType,
} from '@prisma/client';

// ============================================================================
// DTOs para Invoice
// ============================================================================

export class CreateInvoiceDto {
  @IsUUID()
  tenantId: string;

  @IsUUID()
  @IsOptional()
  subscriptionId?: string;

  @IsNumber()
  @Min(0)
  subtotal: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  tax?: number;

  @IsNumber()
  @Min(0)
  total: number;

  @IsDateString()
  dueDate: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  lineItems?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

export class UpdateInvoiceDto {
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class QueryInvoicesDto {
  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

  @IsDateString()
  @IsOptional()
  dueDateFrom?: string;

  @IsDateString()
  @IsOptional()
  dueDateTo?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  overdue?: boolean;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  offset?: number;
}

// ============================================================================
// DTOs para Coupon
// ============================================================================

export class CreateCouponDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(DiscountType)
  @IsOptional()
  discountType?: DiscountType;

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDiscountAmount?: number;

  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxUses?: number;

  @IsArray()
  @IsEnum(PlanType, { each: true })
  @IsOptional()
  applicablePlans?: PlanType[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  minAmount?: number;

  @IsBoolean()
  @IsOptional()
  firstPurchaseOnly?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  durationMonths?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCouponDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountValue?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxDiscountAmount?: number;

  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxUses?: number;

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

  @IsNumber()
  @Min(0)
  @IsOptional()
  amount?: number;

  @IsUUID()
  @IsOptional()
  tenantId?: string;
}

export class QueryCouponsDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  valid?: boolean; // Não expirado

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  offset?: number;
}

// ============================================================================
// DTOs para Billing Jobs
// ============================================================================

export class CreateBillingJobDto {
  @IsEnum(BillingJobType)
  jobType: BillingJobType;

  @IsDateString()
  scheduledFor: string;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsUUID()
  @IsOptional()
  subscriptionId?: string;

  @IsUUID()
  @IsOptional()
  invoiceId?: string;

  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  maxRetries?: number;
}

export class QueryBillingJobsDto {
  @IsEnum(BillingJobType)
  @IsOptional()
  jobType?: BillingJobType;

  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsDateString()
  @IsOptional()
  scheduledFrom?: string;

  @IsDateString()
  @IsOptional()
  scheduledTo?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  offset?: number;
}

// ============================================================================
// DTOs para Payment Retry
// ============================================================================

export class RetryPaymentDto {
  @IsUUID()
  invoiceId: string;

  @IsBoolean()
  @IsOptional()
  force?: boolean; // Forçar mesmo se já atingiu max retries
}

// ============================================================================
// DTOs para Dunning/Reminders
// ============================================================================

export class CreateReminderDto {
  @IsUUID()
  invoiceId: string;

  @IsEnum(ReminderType)
  reminderType: ReminderType;

  @IsDateString()
  scheduledFor: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  content?: string;
}

export class DunningConfigDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  maxRetries?: number;

  @IsArray()
  @IsOptional()
  retryDays?: number[]; // Dias após vencimento para retry [1, 3, 7, 14]

  @IsBoolean()
  @IsOptional()
  sendReminders?: boolean;

  @IsArray()
  @IsOptional()
  reminderDays?: number[]; // Dias antes do vencimento [-3, -1, 0]

  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  cancelAfterDays?: number; // Cancelar assinatura após X dias sem pagamento
}

// ============================================================================
// DTOs de Resposta
// ============================================================================

export class InvoiceResponseDto {
  id: string;
  tenantId: string;
  invoiceNumber?: string;
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  currency: string;
  dueDate: Date;
  paidAt?: Date;
  status: InvoiceStatus;
  billingAttempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  lineItems?: any[];
  invoicePdfUrl?: string;
  hostedInvoiceUrl?: string;
  createdAt: Date;
}

export class CouponResponseDto {
  id: string;
  code: string;
  name: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountAmount?: number;
  validFrom: Date;
  validUntil?: Date;
  maxUses?: number;
  usedCount: number;
  applicablePlans: PlanType[];
  minAmount?: number;
  firstPurchaseOnly: boolean;
  durationMonths?: number;
  isActive: boolean;
  isValid: boolean; // Computed: active + not expired + uses available
}

export class CouponValidationResponseDto {
  valid: boolean;
  code: string;
  discountType?: DiscountType;
  discountValue?: number;
  calculatedDiscount?: number;
  originalAmount?: number;
  finalAmount?: number;
  message?: string;
}

export class BillingStatsDto {
  // MRR (Monthly Recurring Revenue)
  mrr: number;
  mrrGrowth: number; // Percentual de crescimento

  // ARR (Annual Recurring Revenue)
  arr: number;

  // Churn
  churnRate: number;
  churnedSubscriptions: number;

  // Invoices
  totalInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
  pendingAmount: number;

  // Payments
  totalCollected: number;
  failedPayments: number;
  successRate: number;

  // Subscribers
  totalSubscribers: number;
  activeSubscribers: number;
  trialingSubscribers: number;
  cancelledSubscribers: number;

  // By plan
  subscribersByPlan: {
    plan: PlanType;
    count: number;
    revenue: number;
  }[];
}

export class BillingAttemptResponseDto {
  id: string;
  invoiceId: string;
  attemptNumber: number;
  attemptedAt: Date;
  status: string;
  errorCode?: string;
  errorMessage?: string;
}

export class UpcomingInvoiceDto {
  tenantId: string;
  tenantName: string;
  planName: string;
  amount: number;
  dueDate: Date;
  status: string;
}

export class SubscriptionHealthDto {
  tenantId: string;
  tenantName: string;
  status: string;
  planCode: PlanType;
  currentPeriodEnd: Date;
  daysUntilRenewal: number;
  hasPaymentMethod: boolean;
  lastPaymentStatus?: PaymentStatus;
  overdueInvoices: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}
