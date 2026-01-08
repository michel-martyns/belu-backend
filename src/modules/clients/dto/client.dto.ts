import { IsString, IsNotEmpty, IsOptional, IsEmail, IsBoolean, IsDateString } from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do cliente é obrigatório' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  phone: string;

  @IsEmail({}, { message: 'Email inválido' })
  @IsOptional()
  email?: string;

  @IsDateString({}, { message: 'Data de nascimento inválida' })
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsBoolean()
  @IsOptional()
  phoneIsWhatsapp?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateClientDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail({}, { message: 'Email inválido' })
  @IsOptional()
  email?: string;

  @IsDateString({}, { message: 'Data de nascimento inválida' })
  @IsOptional()
  birthDate?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

  @IsBoolean()
  @IsOptional()
  phoneIsWhatsapp?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}
