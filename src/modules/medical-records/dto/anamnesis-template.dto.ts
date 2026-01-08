import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionType } from '@prisma/client';

// ============================================================================
// DTOs para AnamnesisTemplate
// ============================================================================

export class CreateAnamnesisTemplateDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do template é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID('4', { message: 'ID do serviço inválido' })
  @IsOptional()
  serviceId?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  @IsOptional()
  questions?: CreateQuestionDto[];
}

export class UpdateAnamnesisTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID('4', { message: 'ID do serviço inválido' })
  @IsOptional()
  serviceId?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs para AnamnesisQuestion
// ============================================================================

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty({ message: 'Texto da pergunta é obrigatório' })
  question: string;

  @IsEnum(QuestionType, { message: 'Tipo de pergunta inválido' })
  questionType: QuestionType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[]; // Será convertido para JSON

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  helpText?: string;

  @IsString()
  @IsOptional()
  category?: string;
}

export class UpdateQuestionDto {
  @IsString()
  @IsOptional()
  question?: string;

  @IsEnum(QuestionType, { message: 'Tipo de pergunta inválido' })
  @IsOptional()
  questionType?: QuestionType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;

  @IsString()
  @IsOptional()
  helpText?: string;

  @IsString()
  @IsOptional()
  category?: string;
}

export class ReorderQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionOrderDto)
  questions: QuestionOrderDto[];
}

export class QuestionOrderDto {
  @IsUUID('4')
  id: string;

  @IsInt()
  @Min(0)
  order: number;
}

// ============================================================================
// DTOs para AnamnesisResponse (Preenchimento)
// ============================================================================

export class CreateAnamnesisResponseDto {
  @IsUUID('4', { message: 'ID do template inválido' })
  @IsNotEmpty({ message: 'ID do template é obrigatório' })
  templateId: string;

  @IsUUID('4', { message: 'ID do prontuário inválido' })
  @IsNotEmpty({ message: 'ID do prontuário é obrigatório' })
  medicalRecordId: string;

  @IsUUID('4', { message: 'ID da evolução inválido' })
  @IsOptional()
  entryId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  @ArrayMinSize(1, { message: 'Pelo menos uma resposta é obrigatória' })
  answers: AnswerDto[];
}

export class AnswerDto {
  @IsUUID('4', { message: 'ID da pergunta inválido' })
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty({ message: 'Resposta é obrigatória' })
  answer: string;
}

export class UpdateAnamnesisResponseDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  @IsOptional()
  answers?: AnswerDto[];

  @IsBoolean()
  @IsOptional()
  markAsCompleted?: boolean;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryTemplatesDto {
  @IsUUID('4')
  @IsOptional()
  serviceId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class QueryResponsesDto {
  @IsUUID('4')
  @IsOptional()
  templateId?: string;

  @IsUUID('4')
  @IsOptional()
  medicalRecordId?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;
}
