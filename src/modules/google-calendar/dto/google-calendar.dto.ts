import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import {
  SyncDirection,
  CalendarSyncStatus,
} from '@prisma/client';

// ============================================================================
// DTOs para GoogleCalendarConfig
// ============================================================================

export class ConfigureGoogleCalendarDto {
  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  clientSecret?: string;

  @IsBoolean()
  @IsOptional()
  syncEnabled?: boolean;

  @IsString()
  @IsOptional()
  colorScheduled?: string;

  @IsString()
  @IsOptional()
  colorConfirmed?: string;

  @IsString()
  @IsOptional()
  colorCancelled?: string;

  @IsString()
  @IsOptional()
  colorCompleted?: string;
}

export class UpdateGoogleCalendarConfigDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  syncEnabled?: boolean;

  @IsString()
  @IsOptional()
  defaultCalendarId?: string;

  @IsString()
  @IsOptional()
  colorScheduled?: string;

  @IsString()
  @IsOptional()
  colorConfirmed?: string;

  @IsString()
  @IsOptional()
  colorCancelled?: string;

  @IsString()
  @IsOptional()
  colorCompleted?: string;
}

// ============================================================================
// DTOs para OAuth2
// ============================================================================

export class OAuthCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  error?: string;

  @IsString()
  @IsOptional()
  error_description?: string;
}

export class ConnectProviderDto {
  @IsUUID('4', { message: 'ID do profissional inválido' })
  providerId: string;
}

export class SelectCalendarDto {
  @IsString()
  @IsNotEmpty({ message: 'ID do calendário é obrigatório' })
  calendarId: string;

  @IsString()
  @IsOptional()
  calendarName?: string;
}

// ============================================================================
// DTOs para GoogleCalendarSync
// ============================================================================

export class UpdateSyncSettingsDto {
  @IsEnum(SyncDirection)
  @IsOptional()
  syncDirection?: SyncDirection;

  @IsInt()
  @Min(0)
  @Max(30)
  @IsOptional()
  syncPastDays?: number;

  @IsInt()
  @Min(7)
  @Max(365)
  @IsOptional()
  syncFutureDays?: number;
}

// ============================================================================
// DTOs para Sincronização Manual
// ============================================================================

export class SyncAppointmentDto {
  @IsUUID('4', { message: 'ID do agendamento inválido' })
  appointmentId: string;
}

export class SyncRangeDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

// ============================================================================
// DTOs de Query
// ============================================================================

export class QuerySyncsDto {
  @IsEnum(CalendarSyncStatus)
  @IsOptional()
  status?: CalendarSyncStatus;

  @IsUUID('4')
  @IsOptional()
  providerId?: string;
}

export class QueryEventsDto {
  @IsUUID('4')
  @IsOptional()
  syncId?: string;

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
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

// ============================================================================
// DTOs de Resposta
// ============================================================================

export class OAuthUrlResponseDto {
  authUrl: string;
  state: string;
}

export class CalendarListItemDto {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  accessRole: string;
  backgroundColor?: string;
  foregroundColor?: string;
}

export class SyncStatusResponseDto {
  providerId: string;
  providerName: string;
  isConnected: boolean;
  googleEmail?: string;
  calendarName?: string;
  lastSyncAt?: Date;
  syncStatus: CalendarSyncStatus;
  totalEvents: number;
  pendingEvents: number;
  failedEvents: number;
}

export class CalendarStatsDto {
  totalSyncs: number;
  connectedSyncs: number;
  disconnectedSyncs: number;
  totalEvents: number;
  syncedEvents: number;
  pendingEvents: number;
  failedEvents: number;
  lastSyncAt?: Date;
}
