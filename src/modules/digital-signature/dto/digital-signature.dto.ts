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
  IsEmail,
  Min,
  Max,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  DocumentType,
  SignatureStatus,
  SignatureType,
} from '@prisma/client';

// ============================================================================
// DTOs para SignatureTemplate (Templates de Documentos)
// ============================================================================

export class CreateSignatureTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsNotEmpty()
  content: string; // Conteúdo HTML/Markdown

  @IsString()
  @IsOptional()
  headerText?: string;

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsBoolean()
  @IsOptional()
  requiresWitness?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresPhoto?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresLocation?: boolean;

  @IsInt()
  @Min(1)
  @Max(720) // Máximo 30 dias
  @IsOptional()
  expirationHours?: number;

  @IsBoolean()
  @IsOptional()
  allowTypedSignature?: boolean;

  @IsBoolean()
  @IsOptional()
  allowDrawnSignature?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[]; // Ex: ['client_name', 'service_name', 'date']
}

export class UpdateSignatureTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(DocumentType)
  @IsOptional()
  documentType?: DocumentType;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  headerText?: string;

  @IsString()
  @IsOptional()
  footerText?: string;

  @IsBoolean()
  @IsOptional()
  requiresWitness?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresPhoto?: boolean;

  @IsBoolean()
  @IsOptional()
  requiresLocation?: boolean;

  @IsInt()
  @Min(1)
  @Max(720)
  @IsOptional()
  expirationHours?: number;

  @IsBoolean()
  @IsOptional()
  allowTypedSignature?: boolean;

  @IsBoolean()
  @IsOptional()
  allowDrawnSignature?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  variables?: string[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QuerySignatureTemplatesDto {
  @IsEnum(DocumentType)
  @IsOptional()
  documentType?: DocumentType;

  @IsString()
  @IsOptional()
  category?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  isActive?: boolean;

  @IsString()
  @IsOptional()
  search?: string;
}

// ============================================================================
// DTOs para SignatureRequest (Solicitações de Assinatura)
// ============================================================================

export class CreateSignatureRequestDto {
  @IsUUID()
  clientId: string;

  @IsUUID()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(DocumentType)
  @IsOptional()
  documentType?: DocumentType; // Obrigatório se não tiver template

  @IsString()
  @IsOptional()
  documentContent?: string; // Conteúdo customizado (obrigatório se não tiver template)

  // Variáveis para substituição no template
  @IsOptional()
  variables?: Record<string, string>;

  @IsString()
  @IsOptional()
  notes?: string;

  // Vínculos opcionais
  @IsUUID()
  @IsOptional()
  medicalRecordId?: string;

  @IsUUID()
  @IsOptional()
  medicalRecordEntryId?: string;

  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  // Testemunhas (se requerido pelo template)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WitnessDto)
  @IsOptional()
  witnesses?: WitnessDto[];

  // Enviar notificação
  @IsBoolean()
  @IsOptional()
  sendNotification?: boolean;
}

export class WitnessDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  document?: string;
}

export class QuerySignatureRequestsDto {
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsEnum(SignatureStatus)
  @IsOptional()
  status?: SignatureStatus;

  @IsEnum(DocumentType)
  @IsOptional()
  documentType?: DocumentType;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  pending?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  expiringSoon?: boolean; // Expira em 24h

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
// DTOs para Assinatura (Processo de Assinar)
// ============================================================================

export class SignDocumentDto {
  @IsEnum(SignatureType)
  signatureType: SignatureType;

  @IsString()
  @IsNotEmpty()
  signatureData: string; // Base64 da imagem ou texto da assinatura

  @IsString()
  @IsNotEmpty()
  signerName: string;

  @IsEmail()
  @IsOptional()
  signerEmail?: string;

  @IsString()
  @IsOptional()
  signerPhone?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/, {
    message: 'CPF inválido',
  })
  signerDocument?: string; // CPF

  // Foto do signatário (se requerido)
  @IsString()
  @IsOptional()
  signerPhotoBase64?: string;

  // Geolocalização (se requerido)
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  // Informações do dispositivo (capturadas automaticamente)
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}

export class SignWitnessDto {
  @IsEnum(SignatureType)
  signatureType: SignatureType;

  @IsString()
  @IsNotEmpty()
  signatureData: string;
}

export class RejectDocumentDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

// ============================================================================
// DTOs para Verificação
// ============================================================================

export class VerifySignatureDto {
  @IsString()
  @IsNotEmpty()
  verificationCode: string;
}

// ============================================================================
// DTOs de Resposta
// ============================================================================

export class SignatureTemplateResponseDto {
  id: string;
  name: string;
  description?: string;
  documentType: DocumentType;
  category?: string;
  content: string;
  headerText?: string;
  footerText?: string;
  requiresWitness: boolean;
  requiresPhoto: boolean;
  requiresLocation: boolean;
  expirationHours: number;
  allowTypedSignature: boolean;
  allowDrawnSignature: boolean;
  variables: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class SignatureRequestResponseDto {
  id: string;
  code: string;
  title: string;
  documentType: DocumentType;
  status: SignatureStatus;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  createdAt: Date;
  expiresAt: Date;
  viewedAt?: Date;
  signedAt?: Date;
  requestedByName?: string;
  notes?: string;
  templateName?: string;
  requiresWitness: boolean;
  witnessesCount: number;
  signedWitnessesCount: number;
  signatureUrl?: string; // URL para acessar e assinar
}

export class SignatureRequestDetailDto extends SignatureRequestResponseDto {
  documentContent: string;
  signature?: DigitalSignatureDto;
  witnesses: SignatureWitnessDto[];
  auditLog: SignatureAuditLogDto[];
}

export class DigitalSignatureDto {
  id: string;
  signatureType: SignatureType;
  signerName: string;
  signerEmail?: string;
  signerDocument?: string;
  signedAt: Date;
  ipAddress?: string;
  latitude?: number;
  longitude?: number;
  verificationCode: string;
  signedDocumentUrl?: string;
}

export class SignatureWitnessDto {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: string;
  signedAt?: Date;
}

export class SignatureAuditLogDto {
  id: string;
  action: string;
  description: string;
  performerName?: string;
  ipAddress?: string;
  createdAt: Date;
}

// ============================================================================
// DTOs para Página Pública de Assinatura
// ============================================================================

export class PublicSignatureRequestDto {
  id: string;
  code: string;
  title: string;
  documentType: DocumentType;
  documentContent: string;
  status: SignatureStatus;
  expiresAt: Date;
  isExpired: boolean;
  requiresPhoto: boolean;
  requiresLocation: boolean;
  allowTypedSignature: boolean;
  allowDrawnSignature: boolean;
  requiresWitness: boolean;
  witnesses: { name: string; status: string }[];
  tenantName: string;
  tenantLogo?: string;
}

export class SignatureVerificationResultDto {
  isValid: boolean;
  documentTitle: string;
  documentType: DocumentType;
  signerName: string;
  signedAt: Date;
  verificationCode: string;
  signatureHash: string;
  tenantName: string;
}

// ============================================================================
// DTOs para Relatórios
// ============================================================================

export class SignaturesSummaryDto {
  period: { start: Date; end: Date };
  total: number;
  pending: number;
  signed: number;
  expired: number;
  rejected: number;
  cancelled: number;
  averageTimeToSign: number; // em horas
  byDocumentType: { type: DocumentType; count: number }[];
  byStatus: { status: SignatureStatus; count: number }[];
}
