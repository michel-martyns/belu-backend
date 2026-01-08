import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do serviço é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(5, { message: 'Duração mínima é 5 minutos' })
  @Type(() => Number)
  duration: number;

  @IsNumber()
  @Min(0, { message: 'Preço não pode ser negativo' })
  @Type(() => Number)
  price: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateServiceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Min(5, { message: 'Duração mínima é 5 minutos' })
  @IsOptional()
  @Type(() => Number)
  duration?: number;

  @IsNumber()
  @Min(0, { message: 'Preço não pode ser negativo' })
  @IsOptional()
  @Type(() => Number)
  price?: number;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
