import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsUUID,
  IsDateString,
  IsArray,
  IsEnum,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  ValidityType,
  ClientPackageStatus,
  PackageUsageStatus,
} from '@prisma/client';

// ============================================================================
// DTOs para PackageTemplate (Templates de Pacotes)
// ============================================================================

export class CreatePackageTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsInt()
  @Min(1)
  validityDays: number;

  @IsEnum(ValidityType)
  @IsOptional()
  validityType?: ValidityType;

  @IsNumber()
  @Min(0)
  originalPrice: number;

  @IsNumber()
  @Min(0)
  salePrice: number;

  @IsBoolean()
  @IsOptional()
  allowPartialUse?: boolean;

  @IsBoolean()
  @IsOptional()
  transferable?: boolean;

  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  maxInstallments?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageTemplateItemDto)
  @ArrayMinSize(1)
  items: PackageTemplateItemDto[];
}

export class PackageTemplateItemDto {
  @IsUUID()
  serviceId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unitPrice?: number;
}

export class UpdatePackageTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  validityDays?: number;

  @IsEnum(ValidityType)
  @IsOptional()
  validityType?: ValidityType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  originalPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  allowPartialUse?: boolean;

  @IsBoolean()
  @IsOptional()
  transferable?: boolean;

  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  maxInstallments?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageTemplateItemDto)
  @IsOptional()
  items?: PackageTemplateItemDto[];
}

export class QueryPackageTemplatesDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @IsString()
  @IsOptional()
  search?: string;

  @IsUUID()
  @IsOptional()
  serviceId?: string; // Templates que incluem este serviço
}

// ============================================================================
// DTOs para ClientPackage (Pacotes de Clientes)
// ============================================================================

export class SellPackageDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  @IsOptional()
  packageTemplateId?: string; // Se não fornecido, é pacote customizado

  @IsString()
  @IsOptional()
  name?: string; // Obrigatório se não tiver template

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number; // Preço customizado (pode ser diferente do template)

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  installments?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  paidAmount?: number; // Valor já pago (entrada)

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  internalNotes?: string;

  @IsDateString()
  @IsOptional()
  activationDate?: string; // Data de ativação (default: compra)

  @IsDateString()
  @IsOptional()
  expiresAt?: string; // Data de expiração customizada

  // Para pacotes customizados (sem template)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientPackageItemDto)
  @IsOptional()
  items?: ClientPackageItemDto[];
}

export class ClientPackageItemDto {
  @IsUUID()
  serviceId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class UpdateClientPackageDto {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  internalNotes?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsEnum(ClientPackageStatus)
  @IsOptional()
  status?: ClientPackageStatus;
}

export class RegisterPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  paidAt?: string;
}

export class QueryClientPackagesDto {
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsEnum(ClientPackageStatus)
  @IsOptional()
  status?: ClientPackageStatus;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  expiringSoon?: boolean; // Pacotes que vencem em 30 dias

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  hasBalance?: boolean; // Pacotes com saldo disponível

  @IsDateString()
  @IsOptional()
  purchaseDateStart?: string;

  @IsDateString()
  @IsOptional()
  purchaseDateEnd?: string;

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
// DTOs para Uso de Pacotes
// ============================================================================

export class RegisterUsageDto {
  @IsUUID()
  clientPackageId: string;

  @IsUUID()
  serviceId: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number; // Default: 1

  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @IsUUID()
  @IsOptional()
  providerId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelUsageDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class QueryUsagesDto {
  @IsUUID()
  @IsOptional()
  clientPackageId?: string;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @IsEnum(PackageUsageStatus)
  @IsOptional()
  status?: PackageUsageStatus;

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
  @Transform(({ value }) => parseInt(value))
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  offset?: number;
}

// ============================================================================
// DTOs para Transferência de Pacotes
// ============================================================================

export class TransferPackageDto {
  @IsUUID()
  toClientId: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

// ============================================================================
// DTOs de Resposta
// ============================================================================

export class PackageTemplateResponseDto {
  id: string;
  name: string;
  description?: string;
  code?: string;
  validityDays: number;
  validityType: ValidityType;
  originalPrice: number;
  salePrice: number;
  discountPercent: number;
  isActive: boolean;
  allowPartialUse: boolean;
  transferable: boolean;
  maxInstallments: number;
  items: PackageTemplateItemResponseDto[];
  createdAt: Date;
}

export class PackageTemplateItemResponseDto {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice?: number;
  servicePrice: number;
}

export class ClientPackageResponseDto {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description?: string;
  code?: string;
  status: ClientPackageStatus;
  purchaseDate: Date;
  activationDate?: Date;
  expiresAt?: Date;
  daysUntilExpiry?: number;
  originalPrice: number;
  salePrice: number;
  discountAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod?: string;
  installments: number;
  notes?: string;
  items: ClientPackageItemResponseDto[];
  usageStats: PackageUsageStatsDto;
  createdAt: Date;
}

export class ClientPackageItemResponseDto {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  usedQuantity: number;
  availableQuantity: number;
  cancelledQuantity: number;
  unitPrice: number;
  totalValue: number;
  usedValue: number;
}

export class PackageUsageStatsDto {
  totalItems: number;
  usedItems: number;
  availableItems: number;
  usagePercent: number;
  totalValue: number;
  usedValue: number;
  availableValue: number;
}

export class ClientPackageUsageResponseDto {
  id: string;
  clientPackageId: string;
  packageName: string;
  clientName: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  usedAt: Date;
  usedById?: string;
  usedByName?: string;
  providerId?: string;
  providerName?: string;
  appointmentId?: string;
  status: PackageUsageStatus;
  notes?: string;
  cancelledAt?: Date;
  cancellationReason?: string;
}

// ============================================================================
// DTOs para Relatórios
// ============================================================================

export class PackagesSummaryDto {
  period: { start: Date; end: Date };
  sales: {
    count: number;
    totalValue: number;
    averageValue: number;
  };
  usages: {
    count: number;
    totalValue: number;
  };
  expiringPackages: {
    count: number;
    value: number;
  };
  activePackages: {
    count: number;
    totalValue: number;
    availableValue: number;
  };
  topPackages: { templateId: string; templateName: string; count: number; revenue: number }[];
  topServices: { serviceId: string; serviceName: string; usages: number }[];
}

export class ClientPackageBalanceDto {
  clientId: string;
  clientName: string;
  activePackages: number;
  totalPurchased: number;
  totalPaid: number;
  totalPending: number;
  availableServices: {
    serviceId: string;
    serviceName: string;
    available: number;
    expiresAt?: Date;
  }[];
}
