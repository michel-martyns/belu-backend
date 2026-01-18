import {
  IsString,
  IsInt,
  IsOptional,
  IsUUID,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

// ============================================================================
// DTOs para Reviews
// ============================================================================

export class CreateReviewDto {
  @IsUUID('4', { message: 'ID do agendamento inválido' })
  appointmentId: string;

  @IsInt({ message: 'Avaliação deve ser um número inteiro' })
  @Min(1, { message: 'Avaliação mínima é 1 estrela' })
  @Max(5, { message: 'Avaliação máxima é 5 estrelas' })
  rating: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'Comentário deve ter no máximo 1000 caracteres' })
  comment?: string;
}

export class RespondReviewDto {
  @IsString({ message: 'Resposta é obrigatória' })
  @MaxLength(1000, { message: 'Resposta deve ter no máximo 1000 caracteres' })
  response: string;
}

export class UpdateReviewVisibilityDto {
  @IsBoolean({ message: 'Valor de visibilidade inválido' })
  isVisible: boolean;
}

export class QueryReviewsDto {
  @IsUUID('4')
  @IsOptional()
  providerId?: string;

  @IsUUID('4')
  @IsOptional()
  clientId?: string;

  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  minRating?: number;

  @Transform(({ value }) => (value ? parseInt(value, 10) : undefined))
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  maxRating?: number;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasResponse?: boolean;

  @Transform(({ value }) => (value ? parseInt(value, 10) : 20))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @Transform(({ value }) => (value ? parseInt(value, 10) : 0))
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

// ============================================================================
// Response DTOs
// ============================================================================

export class ReviewResponse {
  id: string;
  rating: number;
  comment: string | null;
  response: string | null;
  respondedAt: Date | null;
  isVisible: boolean;
  createdAt: Date;
  client: {
    id: string;
    name: string;
  };
  provider: {
    id: string;
    name: string;
  };
  service: {
    id: string;
    name: string;
  };
  appointment: {
    id: string;
    date: Date;
  };
}

export class ProviderStatsResponse {
  providerId: string;
  providerName: string;
  totalReviews: number;
  averageRating: number;
  totalServices: number;
  ratingBreakdown: {
    rating5: number;
    rating4: number;
    rating3: number;
    rating2: number;
    rating1: number;
  };
}

export class PendingReviewResponse {
  appointmentId: string;
  date: Date;
  serviceName: string;
  providerName: string;
}
