import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsDateString,
  Min,
  IsInt,
  Max,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  PaymentGatewayProvider,
  PlanType,
  PaymentType,
  PaymentStatus,
  SubscriptionStatus,
  InvoiceStatus,
} from '@prisma/client';

// ============================================================================
// DTOs para PaymentGatewayConfig
// ============================================================================

export class ConfigureGatewayDto {
  @IsEnum(PaymentGatewayProvider, { message: 'Provedor de pagamento inválido' })
  provider: PaymentGatewayProvider;

  @IsString()
  @IsOptional()
  publicKey?: string;

  @IsString()
  @IsOptional()
  secretKey?: string;

  @IsString()
  @IsOptional()
  webhookSecret?: string;

  @IsBoolean()
  @IsOptional()
  isTestMode?: boolean;
}

export class UpdateGatewayConfigDto {
  @IsEnum(PaymentGatewayProvider, { message: 'Provedor de pagamento inválido' })
  @IsOptional()
  provider?: PaymentGatewayProvider;

  @IsString()
  @IsOptional()
  publicKey?: string;

  @IsString()
  @IsOptional()
  secretKey?: string;

  @IsString()
  @IsOptional()
  webhookSecret?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isTestMode?: boolean;
}

// ============================================================================
// DTOs para Subscription
// ============================================================================

export class CreateSubscriptionDto {
  @IsEnum(PlanType, { message: 'Tipo de plano inválido' })
  planType: PlanType;

  @IsEnum(PaymentType, { message: 'Método de pagamento inválido' })
  paymentMethod: PaymentType;

  // Dados do cartão (se cartão de crédito)
  @IsString()
  @IsOptional()
  cardToken?: string; // Token do cartão gerado pelo gateway

  @IsString()
  @IsOptional()
  cardHolderName?: string;

  // Cupom de desconto
  @IsString()
  @IsOptional()
  couponCode?: string;

  // Trial
  @IsBoolean()
  @IsOptional()
  startTrial?: boolean;
}

export class UpdateSubscriptionDto {
  @IsEnum(PlanType, { message: 'Tipo de plano inválido' })
  @IsOptional()
  planType?: PlanType;

  @IsBoolean()
  @IsOptional()
  cancelAtPeriodEnd?: boolean;
}

export class CancelSubscriptionDto {
  @IsBoolean()
  @IsOptional()
  immediate?: boolean; // Se true, cancela imediatamente. Se false, cancela no fim do período.

  @IsString()
  @IsOptional()
  reason?: string;
}

// ============================================================================
// DTOs para Payment
// ============================================================================

export class CreatePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsEnum(PaymentType, { message: 'Método de pagamento inválido' })
  paymentMethod: PaymentType;

  @IsString()
  @IsOptional()
  description?: string;

  // Para cartão de crédito
  @IsString()
  @IsOptional()
  cardToken?: string;

  @IsString()
  @IsOptional()
  cardHolderName?: string;

  // Para associar a uma fatura
  @IsUUID('4')
  @IsOptional()
  invoiceId?: string;

  // Metadados extras
  @IsOptional()
  metadata?: Record<string, any>;
}

export class RefundPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  amount?: number; // Se não informado, reembolsa o valor total

  @IsString()
  @IsOptional()
  reason?: string;
}

// ============================================================================
// DTOs para Invoice
// ============================================================================

export class CreateInvoiceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  subtotal: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  discount?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  tax?: number;

  @IsDateString()
  dueDate: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  @IsOptional()
  lineItems?: InvoiceLineItemDto[];
}

export class InvoiceLineItemDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;
}

export class UpdateInvoiceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  subtotal?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  discount?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  tax?: number;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;
}

// ============================================================================
// DTOs para Checkout (fluxo completo de pagamento)
// ============================================================================

export class CheckoutDto {
  @IsEnum(PlanType, { message: 'Tipo de plano inválido' })
  planType: PlanType;

  @IsEnum(PaymentType, { message: 'Método de pagamento inválido' })
  paymentMethod: PaymentType;

  // Dados do cartão
  @IsString()
  @IsOptional()
  cardToken?: string;

  @IsString()
  @IsOptional()
  cardHolderName?: string;

  // Dados do cliente
  @IsString()
  @IsOptional()
  customerName?: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerDocument?: string; // CPF/CNPJ

  @IsString()
  @IsOptional()
  customerPhone?: string;

  // Cupom
  @IsString()
  @IsOptional()
  couponCode?: string;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryPaymentsDto {
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @IsEnum(PaymentType)
  @IsOptional()
  paymentMethod?: PaymentType;

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

export class QueryInvoicesDto {
  @IsEnum(InvoiceStatus)
  @IsOptional()
  status?: InvoiceStatus;

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

export class StripeWebhookDto {
  @IsString()
  type: string;

  @IsOptional()
  data?: any;
}

export class MercadoPagoWebhookDto {
  @IsString()
  @IsOptional()
  action?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsOptional()
  data?: any;
}

// ============================================================================
// DTOs de Resposta
// ============================================================================

export class PaymentIntentResponseDto {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentMethod: PaymentType;
  clientSecret?: string; // Para Stripe
  pixCode?: string;
  pixQrCode?: string;
  boletoCode?: string;
  boletoPdfUrl?: string;
  expiresAt?: Date;
}

export class PlanPricingDto {
  planType: PlanType;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  limits: {
    maxUsers: number;
    maxClients: number;
    maxProviders: number;
    maxStorageMB: number;
  };
}
