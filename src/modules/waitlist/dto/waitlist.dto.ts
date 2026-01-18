import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
  IsEnum,
  IsEmail,
  IsDateString,
  ArrayMinSize,
} from 'class-validator';
import { PreferredPeriod, WaitlistStatus } from '@prisma/client';
import { Transform } from 'class-transformer';

// ============================================================================
// CRIAÇÃO - Endpoint público (cliente entra na fila)
// ============================================================================

export class CreatePublicWaitlistDto {
  @IsUUID('4', { message: 'ID do serviço inválido' })
  @IsNotEmpty({ message: 'Serviço é obrigatório' })
  serviceId: string;

  @IsUUID('4', { message: 'ID do profissional inválido' })
  @IsOptional()
  providerId?: string;

  @IsString({ message: 'Nome deve ser uma string' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @Transform(({ value }) => value?.trim())
  clientName: string;

  @IsString({ message: 'Telefone deve ser uma string' })
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  @Transform(({ value }) => value?.trim())
  clientPhone: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  @IsOptional()
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  clientEmail?: string;

  @IsArray({ message: 'Datas preferenciais deve ser um array' })
  @ArrayMinSize(1, { message: 'Selecione pelo menos uma data preferencial' })
  @IsDateString({}, { each: true, message: 'Data preferencial inválida' })
  preferredDates: string[];

  @IsEnum(PreferredPeriod, { message: 'Período preferido inválido' })
  @IsOptional()
  preferredPeriod?: PreferredPeriod;

  @IsString({ message: 'Observações deve ser uma string' })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  notes?: string;
}

// ============================================================================
// CRIAÇÃO - Endpoint admin (manual)
// ============================================================================

export class CreateWaitlistDto {
  @IsUUID('4', { message: 'ID do serviço inválido' })
  @IsNotEmpty({ message: 'Serviço é obrigatório' })
  serviceId: string;

  @IsUUID('4', { message: 'ID do profissional inválido' })
  @IsOptional()
  providerId?: string;

  @IsUUID('4', { message: 'ID do cliente inválido' })
  @IsOptional()
  clientId?: string;

  @IsString({ message: 'Nome deve ser uma string' })
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @Transform(({ value }) => value?.trim())
  clientName: string;

  @IsString({ message: 'Telefone deve ser uma string' })
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  @Transform(({ value }) => value?.trim())
  clientPhone: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  @IsOptional()
  @Transform(({ value }) => value?.trim()?.toLowerCase())
  clientEmail?: string;

  @IsArray({ message: 'Datas preferenciais deve ser um array' })
  @ArrayMinSize(1, { message: 'Selecione pelo menos uma data preferencial' })
  @IsDateString({}, { each: true, message: 'Data preferencial inválida' })
  preferredDates: string[];

  @IsEnum(PreferredPeriod, { message: 'Período preferido inválido' })
  @IsOptional()
  preferredPeriod?: PreferredPeriod;

  @IsString({ message: 'Observações deve ser uma string' })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  notes?: string;
}

// ============================================================================
// ATUALIZAÇÃO
// ============================================================================

export class UpdateWaitlistDto {
  @IsEnum(WaitlistStatus, { message: 'Status inválido' })
  @IsOptional()
  status?: WaitlistStatus;

  @IsArray({ message: 'Datas preferenciais deve ser um array' })
  @IsDateString({}, { each: true, message: 'Data preferencial inválida' })
  @IsOptional()
  preferredDates?: string[];

  @IsEnum(PreferredPeriod, { message: 'Período preferido inválido' })
  @IsOptional()
  preferredPeriod?: PreferredPeriod;

  @IsString({ message: 'Observações deve ser uma string' })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  notes?: string;

  @IsUUID('4', { message: 'ID do profissional inválido' })
  @IsOptional()
  providerId?: string;
}

// ============================================================================
// QUERY / FILTROS
// ============================================================================

export class QueryWaitlistDto {
  @IsEnum(WaitlistStatus, { message: 'Status inválido' })
  @IsOptional()
  status?: WaitlistStatus;

  @IsUUID('4', { message: 'ID do serviço inválido' })
  @IsOptional()
  serviceId?: string;

  @IsUUID('4', { message: 'ID do profissional inválido' })
  @IsOptional()
  providerId?: string;

  @IsString()
  @IsOptional()
  search?: string;
}

// ============================================================================
// NOTIFICAÇÃO
// ============================================================================

export class NotifyWaitlistDto {
  @IsString({ message: 'Mensagem deve ser uma string' })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  message?: string;
}
