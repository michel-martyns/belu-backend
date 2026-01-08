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
  IsObject,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TransferStatus } from '@prisma/client';

// ============================================================================
// DTOs auxiliares (devem vir primeiro)
// ============================================================================

export class DayHoursDto {
  open: string;  // "08:00"
  close: string; // "18:00"
  breakStart?: string; // "12:00"
  breakEnd?: string;   // "13:00"
  isClosed?: boolean;
}

export class BusinessHoursDto {
  mon?: DayHoursDto;
  tue?: DayHoursDto;
  wed?: DayHoursDto;
  thu?: DayHoursDto;
  fri?: DayHoursDto;
  sat?: DayHoursDto;
  sun?: DayHoursDto;
}

// ============================================================================
// DTOs para Location
// ============================================================================

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  // Endereço
  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  addressNumber?: string;

  @IsString()
  @IsOptional()
  complement?: string;

  @IsString()
  @IsOptional()
  neighborhood?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  country?: string;

  // Coordenadas
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  // Contato
  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsString()
  @IsOptional()
  email?: string;

  // Horário de funcionamento
  @IsObject()
  @IsOptional()
  businessHours?: BusinessHoursDto;

  // Configurações
  @IsString()
  @IsOptional()
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  isHeadquarters?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateLocationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  addressNumber?: string;

  @IsString()
  @IsOptional()
  complement?: string;

  @IsString()
  @IsOptional()
  neighborhood?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsObject()
  @IsOptional()
  businessHours?: BusinessHoursDto;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsBoolean()
  @IsOptional()
  isHeadquarters?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QueryLocationsDto {
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isHeadquarters?: boolean;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  includeProviders?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  includeInventory?: boolean;
}

// ============================================================================
// DTOs para ProviderLocation
// ============================================================================

export class AssignProviderToLocationDto {
  @IsUUID()
  providerId: string;

  @IsUUID()
  locationId: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsObject()
  @IsOptional()
  scheduleOverride?: any;
}

export class UpdateProviderLocationDto {
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  @IsOptional()
  scheduleOverride?: any;
}

// ============================================================================
// DTOs para LocationInventory
// ============================================================================

export class SetLocationInventoryDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(0)
  currentStock: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxStock?: number;
}

export class AdjustLocationInventoryDto {
  @IsUUID()
  productId: string;

  @IsInt()
  adjustment: number; // Positivo ou negativo

  @IsString()
  @IsOptional()
  reason?: string;
}

export class QueryLocationInventoryDto {
  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  lowStock?: boolean; // Estoque abaixo do mínimo

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  outOfStock?: boolean; // Estoque zerado
}

// ============================================================================
// DTOs para LocationTransfer
// ============================================================================

export class CreateTransferDto {
  @IsUUID()
  fromLocationId: string;

  @IsUUID()
  toLocationId: string;

  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsOptional()
  unitCost?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTransferStatusDto {
  @IsEnum(TransferStatus)
  status: TransferStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryTransfersDto {
  @IsUUID()
  @IsOptional()
  fromLocationId?: string;

  @IsUUID()
  @IsOptional()
  toLocationId?: string;

  @IsUUID()
  @IsOptional()
  productId?: string;

  @IsEnum(TransferStatus)
  @IsOptional()
  status?: TransferStatus;

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
// DTOs para Relatórios Consolidados
// ============================================================================

export class ConsolidatedReportQueryDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  locationIds?: string[]; // Vazio = todas as unidades

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  @IsOptional()
  groupBy?: 'day' | 'week' | 'month'; // Agrupamento temporal
}

// ============================================================================
// DTOs de Resposta
// ============================================================================

export class LocationResponseDto {
  id: string;
  name: string;
  code?: string;
  slug?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  isHeadquarters: boolean;
  isActive: boolean;
  providersCount?: number;
  appointmentsToday?: number;
}

export class LocationDetailResponseDto extends LocationResponseDto {
  addressNumber?: string;
  complement?: string;
  neighborhood?: string;
  zipCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  whatsapp?: string;
  email?: string;
  businessHours?: BusinessHoursDto;
  timezone: string;
  providers?: ProviderLocationResponseDto[];
  createdAt: Date;
  updatedAt: Date;
}

export class ProviderLocationResponseDto {
  id: string;
  providerId: string;
  providerName: string;
  locationId: string;
  locationName: string;
  isPrimary: boolean;
  isActive: boolean;
}

export class LocationInventoryResponseDto {
  locationId: string;
  locationName: string;
  productId: string;
  productName: string;
  sku?: string;
  currentStock: number;
  minStock: number;
  maxStock?: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

export class TransferResponseDto {
  id: string;
  fromLocation: { id: string; name: string };
  toLocation: { id: string; name: string };
  product: { id: string; name: string; sku?: string };
  quantity: number;
  unitCost?: number;
  status: TransferStatus;
  requestedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  notes?: string;
}

// Relatórios Consolidados
export class ConsolidatedDashboardDto {
  period: { start: Date; end: Date };
  locations: LocationSummaryDto[];
  totals: {
    appointments: number;
    revenue: number;
    clients: number;
    newClients: number;
    completedServices: number;
    cancelledAppointments: number;
  };
}

export class LocationSummaryDto {
  locationId: string;
  locationName: string;
  isHeadquarters: boolean;
  metrics: {
    appointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    revenue: number;
    averageTicket: number;
    clients: number;
    newClients: number;
    providersActive: number;
    servicesPerformed: number;
  };
  topServices: { serviceId: string; serviceName: string; count: number }[];
  topProviders: { providerId: string; providerName: string; revenue: number }[];
}

export class ConsolidatedFinancialReportDto {
  period: { start: Date; end: Date };
  locations: LocationFinancialDto[];
  totals: {
    grossRevenue: number;
    discounts: number;
    netRevenue: number;
    expenses: number;
    profit: number;
    profitMargin: number;
  };
}

export class LocationFinancialDto {
  locationId: string;
  locationName: string;
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  expenses: number;
  profit: number;
  profitMargin: number;
  revenueByCategory: { category: string; amount: number }[];
  expensesByCategory: { category: string; amount: number }[];
}

export class ConsolidatedInventoryReportDto {
  locations: LocationInventorySummaryDto[];
  alerts: {
    lowStock: { locationId: string; locationName: string; productId: string; productName: string; current: number; min: number }[];
    outOfStock: { locationId: string; locationName: string; productId: string; productName: string }[];
  };
  transfers: {
    pending: number;
    inTransit: number;
    completedThisMonth: number;
  };
}

export class LocationInventorySummaryDto {
  locationId: string;
  locationName: string;
  totalProducts: number;
  totalValue: number;
  lowStockItems: number;
  outOfStockItems: number;
}
