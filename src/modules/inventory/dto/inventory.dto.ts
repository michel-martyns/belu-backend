import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  ProductUnit,
  ProductType,
  StockMovementType,
} from '@prisma/client';

// ============================================================================
// DTOs para ProductCategory
// ============================================================================

export class CreateProductCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome da categoria é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateProductCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs para Product
// ============================================================================

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do produto é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsUUID('4', { message: 'ID da categoria inválido' })
  @IsOptional()
  categoryId?: string;

  @IsNumber({}, { message: 'Preço de custo deve ser um número' })
  @Min(0, { message: 'Preço de custo deve ser maior ou igual a zero' })
  costPrice: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  currentStock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxStock?: number;

  @IsEnum(ProductUnit, { message: 'Unidade inválida' })
  @IsOptional()
  unit?: ProductUnit;

  @IsEnum(ProductType, { message: 'Tipo de produto inválido' })
  @IsOptional()
  productType?: ProductType;
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsUUID('4', { message: 'ID da categoria inválido' })
  @IsOptional()
  categoryId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  costPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  salePrice?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minStock?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  maxStock?: number;

  @IsEnum(ProductUnit, { message: 'Unidade inválida' })
  @IsOptional()
  unit?: ProductUnit;

  @IsEnum(ProductType, { message: 'Tipo de produto inválido' })
  @IsOptional()
  productType?: ProductType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs para StockMovement
// ============================================================================

export class CreateStockMovementDto {
  @IsUUID('4', { message: 'ID do produto inválido' })
  @IsNotEmpty({ message: 'Produto é obrigatório' })
  productId: string;

  @IsEnum(StockMovementType, { message: 'Tipo de movimentação inválido' })
  type: StockMovementType;

  @IsInt({ message: 'Quantidade deve ser um número inteiro' })
  @Min(1, { message: 'Quantidade deve ser maior que zero' })
  quantity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unitCost?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsUUID('4', { message: 'ID do agendamento inválido' })
  @IsOptional()
  appointmentId?: string;

  @IsUUID('4', { message: 'ID do profissional inválido' })
  @IsOptional()
  providerId?: string;

  @IsString()
  @IsOptional()
  supplierId?: string;
}

export class StockAdjustmentDto {
  @IsUUID('4', { message: 'ID do produto inválido' })
  @IsNotEmpty({ message: 'Produto é obrigatório' })
  productId: string;

  @IsInt({ message: 'Nova quantidade deve ser um número inteiro' })
  @Min(0, { message: 'Quantidade não pode ser negativa' })
  newQuantity: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

// ============================================================================
// DTOs para ServiceProduct (Consumo automático)
// ============================================================================

export class CreateServiceProductDto {
  @IsUUID('4', { message: 'ID do serviço inválido' })
  @IsNotEmpty({ message: 'Serviço é obrigatório' })
  serviceId: string;

  @IsUUID('4', { message: 'ID do produto inválido' })
  @IsNotEmpty({ message: 'Produto é obrigatório' })
  productId: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;
}

export class UpdateServiceProductDto {
  @IsInt()
  @Min(1)
  quantity: number;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryProductsDto {
  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @IsEnum(ProductType)
  @IsOptional()
  productType?: ProductType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  lowStock?: boolean; // Filtrar produtos com estoque baixo

  @IsString()
  @IsOptional()
  search?: string; // Busca por nome, SKU ou código de barras

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

export class QueryStockMovementsDto {
  @IsUUID('4')
  @IsOptional()
  productId?: string;

  @IsEnum(StockMovementType)
  @IsOptional()
  type?: StockMovementType;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsUUID('4')
  @IsOptional()
  providerId?: string;

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
