import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProviderDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do profissional é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  phoneIsWhatsapp?: boolean;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class UpdateProviderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  phoneIsWhatsapp?: boolean;

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class ProviderServiceDto {
  @IsString()
  serviceId: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  customPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  commissionPercent?: number;
}

export class SetProviderServicesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderServiceDto)
  services: ProviderServiceDto[];
}

export class ProviderScheduleItemDto {
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsBoolean()
  isAvailable: boolean;
}

export class SetProviderScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProviderScheduleItemDto)
  schedules: ProviderScheduleItemDto[];
}
