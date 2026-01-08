import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CreatePublicAppointmentDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  clientName: string;

  @IsString()
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  clientPhone: string;

  @IsString()
  @IsNotEmpty({ message: 'Profissional é obrigatório' })
  providerId: string;

  @IsString()
  @IsNotEmpty({ message: 'Serviço é obrigatório' })
  serviceId: string;

  @IsDateString({}, { message: 'Data inválida' })
  date: string;

  @IsString()
  @IsNotEmpty({ message: 'Horário é obrigatório' })
  startTime: string;
}

export class ContactMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Mensagem é obrigatória' })
  message: string;
}
