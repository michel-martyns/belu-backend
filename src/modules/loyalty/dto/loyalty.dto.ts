import {
  IsString,
  IsInt,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsEnum,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

// ============================================================================
// Enums
// ============================================================================

export enum LoyaltyTransactionType {
  EARNED = 'EARNED',
  BONUS = 'BONUS',
  REDEEMED = 'REDEEMED',
  EXPIRED = 'EXPIRED',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum RedemptionStatus {
  PENDING = 'PENDING',
  USED = 'USED',
  CANCELLED = 'CANCELLED',
}

// ============================================================================
// DTOs para LoyaltyConfig
// ============================================================================

export class UpdateLoyaltyConfigDto {
  @IsInt({ message: 'Pontos por real deve ser um número inteiro' })
  @Min(1, { message: 'Pontos por real deve ser no mínimo 1' })
  @IsOptional()
  pointsPerCurrency?: number;

  @IsNumber({}, { message: 'Valor de resgate deve ser um número' })
  @Min(1, { message: 'Valor de resgate deve ser no mínimo R$1' })
  @IsOptional()
  @Type(() => Number)
  pointsRedemptionValue?: number;

  @IsInt({ message: 'Mínimo para resgate deve ser um número inteiro' })
  @Min(1, { message: 'Mínimo para resgate deve ser no mínimo 1 ponto' })
  @IsOptional()
  minimumRedemption?: number;

  @IsInt({ message: 'Meses de expiração deve ser um número inteiro' })
  @Min(1, { message: 'Meses de expiração deve ser no mínimo 1' })
  @Max(60, { message: 'Meses de expiração deve ser no máximo 60' })
  @IsOptional()
  expirationMonths?: number;

  @IsNumber({}, { message: 'Multiplicador de aniversário deve ser um número' })
  @Min(1, { message: 'Multiplicador de aniversário deve ser no mínimo 1' })
  @Max(10, { message: 'Multiplicador de aniversário deve ser no máximo 10' })
  @IsOptional()
  @Type(() => Number)
  birthdayMultiplier?: number;

  @IsBoolean({ message: 'isActive deve ser booleano' })
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs para Transactions
// ============================================================================

export class CreateTransactionDto {
  @IsUUID('4', { message: 'ID do cliente inválido' })
  clientId: string;

  @IsEnum(LoyaltyTransactionType, { message: 'Tipo de transação inválido' })
  type: LoyaltyTransactionType;

  @IsInt({ message: 'Pontos deve ser um número inteiro' })
  points: number;

  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Descrição deve ter no máximo 255 caracteres' })
  description?: string;

  @IsUUID('4')
  @IsOptional()
  appointmentId?: string;
}

export class QueryTransactionsDto {
  @IsUUID('4')
  @IsOptional()
  clientId?: string;

  @IsEnum(LoyaltyTransactionType)
  @IsOptional()
  type?: LoyaltyTransactionType;

  @Transform(({ value }) => (value ? parseInt(value, 10) : 20))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @Transform(({ value }) => (value ? parseInt(value, 10) : 0))
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

// ============================================================================
// DTOs para Redemptions
// ============================================================================

export class CreateRedemptionDto {
  @IsUUID('4', { message: 'ID do cliente inválido' })
  clientId: string;

  @IsInt({ message: 'Pontos deve ser um número inteiro' })
  @Min(1, { message: 'Deve resgatar pelo menos 1 ponto' })
  points: number;
}

export class UseRedemptionDto {
  @IsUUID('4', { message: 'ID do agendamento inválido' })
  appointmentId: string;
}

export class QueryRedemptionsDto {
  @IsUUID('4')
  @IsOptional()
  clientId?: string;

  @IsEnum(RedemptionStatus)
  @IsOptional()
  status?: RedemptionStatus;

  @Transform(({ value }) => (value ? parseInt(value, 10) : 20))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @Transform(({ value }) => (value ? parseInt(value, 10) : 0))
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

// ============================================================================
// Response DTOs
// ============================================================================

export class LoyaltyConfigResponse {
  id: string;
  tenantId: string;
  pointsPerCurrency: number;
  pointsRedemptionValue: number;
  minimumRedemption: number;
  expirationMonths: number;
  birthdayMultiplier: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class LoyaltyBalanceResponse {
  clientId: string;
  clientName: string;
  totalEarned: number;
  totalRedeemed: number;
  totalExpired: number;
  currentBalance: number;
  pendingRedemptions: number;
  availableBalance: number;
}

export class LoyaltyTransactionResponse {
  id: string;
  clientId: string;
  appointmentId: string | null;
  type: LoyaltyTransactionType;
  points: number;
  description: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  client?: {
    id: string;
    name: string;
  };
  appointment?: {
    id: string;
    date: Date;
    service?: {
      name: string;
    };
  };
}

export class LoyaltyRedemptionResponse {
  id: string;
  clientId: string;
  appointmentId: string | null;
  pointsUsed: number;
  discountValue: number;
  status: RedemptionStatus;
  createdAt: Date;
  usedAt: Date | null;
  client?: {
    id: string;
    name: string;
  };
}

export class LoyaltyStatsResponse {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsExpired: number;
  totalActivePoints: number;
  totalClientsWithPoints: number;
  totalPendingRedemptions: number;
  totalPendingValue: number;
  averagePointsPerClient: number;
}

export class LoyaltyLeaderboardEntry {
  clientId: string;
  clientName: string;
  clientPhone: string;
  totalEarned: number;
  currentBalance: number;
  totalRedemptions: number;
}
