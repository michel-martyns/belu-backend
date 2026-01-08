import { IsOptional, IsString, IsDateString } from 'class-validator';

export class CancelAppointmentDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

export class GetAppointmentsQueryDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  status?: string;
}
