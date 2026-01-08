import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AppointmentStatus } from '@prisma/client';

export class CreateAppointmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Cliente é obrigatório' })
  clientId: string;

  @IsString()
  @IsNotEmpty({ message: 'Profissional é obrigatório' })
  providerId: string;

  @IsString()
  @IsNotEmpty({ message: 'Serviço é obrigatório' })
  serviceId: string;

  @IsDateString({}, { message: 'Data inválida' })
  date: string;

  @IsString()
  @IsNotEmpty({ message: 'Horário de início é obrigatório' })
  startTime: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  price?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  providerId?: string;

  @IsString()
  @IsOptional()
  serviceId?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  price?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateStatusDto {
  @IsEnum(AppointmentStatus, { message: 'Status inválido' })
  status: AppointmentStatus;
}

export class GetAvailableSlotsDto {
  @IsString()
  @IsNotEmpty()
  providerId: string;

  @IsDateString()
  date: string;

  @IsString()
  @IsOptional()
  serviceId?: string;
}
