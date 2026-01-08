import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsArray,
  IsEmail,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  LeadSource,
  LeadStage,
  LeadPriority,
  InteractionType,
} from '@prisma/client';

// ============================================================================
// DTOs para Lead
// ============================================================================

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsEmail({}, { message: 'Email inválido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsEnum(LeadSource, { message: 'Fonte inválida' })
  @IsOptional()
  source?: LeadSource;

  @IsString()
  @IsOptional()
  sourceDetail?: string;

  @IsEnum(LeadStage, { message: 'Estágio inválido' })
  @IsOptional()
  stage?: LeadStage;

  @IsEnum(LeadPriority, { message: 'Prioridade inválida' })
  @IsOptional()
  priority?: LeadPriority;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  interestedServices?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedValue?: number;

  @IsUUID('4', { message: 'ID do responsável inválido' })
  @IsOptional()
  assignedToId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  nextFollowUpAt?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  tagIds?: string[];
}

export class UpdateLeadDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail({}, { message: 'Email inválido' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsEnum(LeadSource, { message: 'Fonte inválida' })
  @IsOptional()
  source?: LeadSource;

  @IsString()
  @IsOptional()
  sourceDetail?: string;

  @IsEnum(LeadPriority, { message: 'Prioridade inválida' })
  @IsOptional()
  priority?: LeadPriority;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  interestedServices?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  estimatedValue?: number;

  @IsUUID('4', { message: 'ID do responsável inválido' })
  @IsOptional()
  assignedToId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsDateString()
  @IsOptional()
  nextFollowUpAt?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  tagIds?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ChangeStageDto {
  @IsEnum(LeadStage, { message: 'Estágio inválido' })
  stage: LeadStage;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  lostReason?: string; // Obrigatório se stage = LOST
}

export class ConvertLeadDto {
  @IsString()
  @IsOptional()
  notes?: string;

  // Dados adicionais do cliente (opcionais)
  @IsString()
  @IsOptional()
  clientNotes?: string;
}

// ============================================================================
// DTOs para LeadInteraction
// ============================================================================

export class CreateInteractionDto {
  @IsEnum(InteractionType, { message: 'Tipo de interação inválido' })
  type: InteractionType;

  @IsString()
  @IsNotEmpty({ message: 'Título é obrigatório' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  outcome?: string;
}

// ============================================================================
// DTOs para LeadTag
// ============================================================================

export class CreateTagDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome da tag é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateTagDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  color?: string;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryLeadsDto {
  @IsEnum(LeadStage)
  @IsOptional()
  stage?: LeadStage;

  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @IsEnum(LeadPriority)
  @IsOptional()
  priority?: LeadPriority;

  @IsUUID('4')
  @IsOptional()
  assignedToId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsBoolean()
  @IsOptional()
  hasFollowUpToday?: boolean;

  @IsBoolean()
  @IsOptional()
  overdueFollowUp?: boolean;

  @IsString()
  @IsOptional()
  search?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  tagIds?: string[];

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

export class LeadsByStageDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
