import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

// ============================================================================
// REGISTRO
// ============================================================================

export class ClientRegisterDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'Slug da clínica é obrigatório' })
  slug: string; // Identifica a clínica (tenant)
}

// ============================================================================
// LOGIN
// ============================================================================

export class ClientLoginDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Senha é obrigatória' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Slug da clínica é obrigatório' })
  slug: string;
}

// ============================================================================
// OTP (One-Time Password)
// ============================================================================

export class RequestOtpDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Slug da clínica é obrigatório' })
  slug: string;
}

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Código é obrigatório' })
  @MinLength(6, { message: 'Código deve ter 6 dígitos' })
  @MaxLength(6, { message: 'Código deve ter 6 dígitos' })
  @Matches(/^\d{6}$/, { message: 'Código deve conter apenas números' })
  code: string;

  @IsString()
  @IsNotEmpty({ message: 'Slug da clínica é obrigatório' })
  slug: string;
}

// ============================================================================
// TOKENS
// ============================================================================

export class ClientRefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Refresh token é obrigatório' })
  refreshToken: string;
}

// ============================================================================
// RECUPERAÇÃO DE SENHA
// ============================================================================

export class ClientForgotPasswordDto {
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Slug da clínica é obrigatório' })
  slug: string;
}

export class ClientResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Token é obrigatório' })
  token: string;

  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;
}

export class ClientVerifyResetTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Token é obrigatório' })
  token: string;
}

// ============================================================================
// PERFIL
// ============================================================================

export class ClientUpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

export class ClientChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Senha atual é obrigatória' })
  currentPassword: string;

  @IsString()
  @MinLength(6, { message: 'Nova senha deve ter no mínimo 6 caracteres' })
  newPassword: string;
}

// ============================================================================
// RESPONSES
// ============================================================================

export class ClientAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  client: {
    id: string;
    tenantId: string;
    email: string;
    name: string;
    phone: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
}

export class ClientTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class ClientProfileResponse {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone: string;
  isEmailVerified: boolean;
  createdAt: Date;
}
