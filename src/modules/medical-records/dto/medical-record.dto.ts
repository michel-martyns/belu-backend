import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';
import { MedicalEntryType, AttachmentCategory } from '@prisma/client';

// ============================================================================
// DTOs para MedicalRecord (Prontuário)
// ============================================================================

export class CreateMedicalRecordDto {
  @IsUUID('4', { message: 'ID do cliente inválido' })
  @IsNotEmpty({ message: 'ID do cliente é obrigatório' })
  clientId: string;

  @IsString()
  @IsOptional()
  bloodType?: string;

  @IsString()
  @IsOptional()
  allergies?: string;

  @IsString()
  @IsOptional()
  medications?: string;

  @IsString()
  @IsOptional()
  medicalHistory?: string;

  @IsString()
  @IsOptional()
  surgeries?: string;

  @IsString()
  @IsOptional()
  observations?: string;
}

export class UpdateMedicalRecordDto {
  @IsString()
  @IsOptional()
  bloodType?: string;

  @IsString()
  @IsOptional()
  allergies?: string;

  @IsString()
  @IsOptional()
  medications?: string;

  @IsString()
  @IsOptional()
  medicalHistory?: string;

  @IsString()
  @IsOptional()
  surgeries?: string;

  @IsString()
  @IsOptional()
  observations?: string;
}

// ============================================================================
// DTOs para MedicalRecordEntry (Evolução)
// ============================================================================

export class CreateEntryDto {
  @IsString()
  @IsNotEmpty({ message: 'Título é obrigatório' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Descrição é obrigatória' })
  description: string;

  @IsString()
  @IsOptional()
  procedures?: string;

  @IsString()
  @IsOptional()
  products?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(MedicalEntryType, { message: 'Tipo de entrada inválido' })
  @IsOptional()
  entryType?: MedicalEntryType;

  @IsUUID('4', { message: 'ID do agendamento inválido' })
  @IsOptional()
  appointmentId?: string;

  @IsUUID('4', { message: 'ID do profissional inválido' })
  @IsOptional()
  providerId?: string;
}

export class UpdateEntryDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  procedures?: string;

  @IsString()
  @IsOptional()
  products?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsEnum(MedicalEntryType, { message: 'Tipo de entrada inválido' })
  @IsOptional()
  entryType?: MedicalEntryType;
}

// ============================================================================
// DTOs para MedicalRecordAttachment (Anexo)
// ============================================================================

export class CreateAttachmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do arquivo é obrigatório' })
  fileName: string;

  @IsString()
  @IsNotEmpty({ message: 'Chave do arquivo é obrigatória' })
  fileKey: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;

  @IsString()
  @IsNotEmpty({ message: 'Tipo do arquivo é obrigatório' })
  fileType: string;

  @IsInt()
  @Min(0)
  fileSize: number;

  @IsEnum(AttachmentCategory, { message: 'Categoria inválida' })
  @IsOptional()
  category?: AttachmentCategory;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID('4', { message: 'ID da evolução inválido' })
  @IsOptional()
  entryId?: string;
}

export class UpdateAttachmentDto {
  @IsEnum(AttachmentCategory, { message: 'Categoria inválida' })
  @IsOptional()
  category?: AttachmentCategory;

  @IsString()
  @IsOptional()
  description?: string;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryEntriesDto {
  @IsEnum(MedicalEntryType)
  @IsOptional()
  entryType?: MedicalEntryType;

  @IsUUID('4')
  @IsOptional()
  providerId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

export class QueryAttachmentsDto {
  @IsEnum(AttachmentCategory)
  @IsOptional()
  category?: AttachmentCategory;

  @IsUUID('4')
  @IsOptional()
  entryId?: string;
}
