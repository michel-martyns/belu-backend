import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsInt,
  IsNumber,
  IsDateString,
  IsEmail,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { GiftCardStatus } from '@prisma/client';

// ============================================================================
// PURCHASE GIFT CARD (Compra)
// ============================================================================

export class PurchaseGiftCardDto {
  @IsNumber()
  @Min(10)
  @Max(10000)
  value: number;

  // Dados do comprador
  @IsOptional()
  @IsString()
  purchaserName?: string;

  @IsOptional()
  @IsEmail()
  purchaserEmail?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Telefone deve ter 10 ou 11 dígitos' })
  purchaserPhone?: string;

  // Dados do presenteado
  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10,11}$/, { message: 'Telefone deve ter 10 ou 11 dígitos' })
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  message?: string;

  // Opções
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expirationDays?: number; // Padrão: 365 dias

  @IsOptional()
  @IsBoolean()
  sendNotification?: boolean; // Enviar notificação para o presenteado
}

// ============================================================================
// CREATE GIFT CARD (Admin - criação manual)
// ============================================================================

export class CreateGiftCardDto extends PurchaseGiftCardDto {
  @IsOptional()
  @IsEnum(GiftCardStatus)
  status?: GiftCardStatus;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentId?: string;
}

// ============================================================================
// UPDATE GIFT CARD
// ============================================================================

export class UpdateGiftCardDto {
  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  recipientPhone?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsEnum(GiftCardStatus)
  status?: GiftCardStatus;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

// ============================================================================
// VALIDATE GIFT CARD
// ============================================================================

export class ValidateGiftCardDto {
  @IsString()
  code: string;
}

// ============================================================================
// REDEEM GIFT CARD (Usar)
// ============================================================================

export class RedeemGiftCardDto {
  @IsString()
  code: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  appointmentId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// ============================================================================
// REFUND GIFT CARD
// ============================================================================

export class RefundGiftCardDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}

// ============================================================================
// ADJUST BALANCE
// ============================================================================

export class AdjustBalanceDto {
  @IsNumber()
  amount: number; // Positivo para crédito, negativo para débito

  @IsString()
  description: string;
}

// ============================================================================
// QUERY GIFT CARDS
// ============================================================================

export class QueryGiftCardsDto {
  @IsOptional()
  @IsEnum(GiftCardStatus)
  status?: GiftCardStatus;

  @IsOptional()
  @IsString()
  search?: string; // Busca por código, nome ou email

  @IsOptional()
  @IsBoolean()
  includeExpired?: boolean;

  @IsOptional()
  @IsBoolean()
  includeDepleted?: boolean;

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
// SEND NOTIFICATION
// ============================================================================

export class SendGiftCardNotificationDto {
  @IsOptional()
  @IsString()
  channel?: 'EMAIL' | 'WHATSAPP' | 'BOTH';
}
