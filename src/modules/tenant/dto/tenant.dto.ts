import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PlanType } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100, { message: 'Nome deve ter no máximo 100 caracteres' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Slug é obrigatório' })
  @MinLength(3, { message: 'Slug deve ter no mínimo 3 caracteres' })
  @MaxLength(50, { message: 'Slug deve ter no máximo 50 caracteres' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug deve conter apenas letras minúsculas, números e hífens',
  })
  slug: string;

  @IsEnum(PlanType)
  @IsOptional()
  plan?: PlanType;
}

export class UpdateTenantDto {
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100, { message: 'Nome deve ter no máximo 100 caracteres' })
  name?: string;

  @IsString()
  @IsOptional()
  @MinLength(3, { message: 'Slug deve ter no mínimo 3 caracteres' })
  @MaxLength(50, { message: 'Slug deve ter no máximo 50 caracteres' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug deve conter apenas letras minúsculas, números e hífens',
  })
  slug?: string;

  @IsEnum(PlanType)
  @IsOptional()
  plan?: PlanType;
}

export class TenantResponse {
  id: string;
  name: string;
  slug: string;
  plan: PlanType;
  isActive: boolean;
  createdAt: Date;
}
