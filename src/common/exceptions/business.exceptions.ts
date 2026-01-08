import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Exceção base para erros de negócio
 */
export class BusinessException extends HttpException {
  constructor(message: string, statusCode: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(
      {
        statusCode,
        message,
        error: 'Business Error',
      },
      statusCode,
    );
  }
}

/**
 * Recurso não encontrado
 */
export class ResourceNotFoundException extends HttpException {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} com identificador '${identifier}' não encontrado`
      : `${resource} não encontrado`;

    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        message,
        error: 'Not Found',
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Recurso já existe (conflito)
 */
export class ResourceAlreadyExistsException extends HttpException {
  constructor(resource: string, field?: string) {
    const message = field
      ? `Já existe um(a) ${resource} com este ${field}`
      : `${resource} já existe`;

    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message,
        error: 'Conflict',
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Operação não permitida
 */
export class OperationNotAllowedException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message,
        error: 'Operation Not Allowed',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * Limite do plano excedido
 */
export class PlanLimitExceededException extends HttpException {
  constructor(resource: string, limit: number) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: `Limite do plano atingido. Máximo de ${limit} ${resource} permitidos. Faça upgrade para continuar.`,
        error: 'Plan Limit Exceeded',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * Funcionalidade não disponível no plano
 */
export class FeatureNotAvailableException extends HttpException {
  constructor(feature: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: `A funcionalidade '${feature}' não está disponível no seu plano. Faça upgrade para acessar.`,
        error: 'Feature Not Available',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * Credenciais inválidas
 */
export class InvalidCredentialsException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Email ou senha inválidos',
        error: 'Invalid Credentials',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Token inválido ou expirado
 */
export class InvalidTokenException extends HttpException {
  constructor(tokenType: string = 'Token') {
    super(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: `${tokenType} inválido ou expirado`,
        error: 'Invalid Token',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}

/**
 * Conta inativa
 */
export class AccountInactiveException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Sua conta está inativa. Entre em contato com o suporte.',
        error: 'Account Inactive',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

/**
 * Conflito de agendamento
 */
export class ScheduleConflictException extends HttpException {
  constructor(message?: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        message: message || 'Já existe um agendamento neste horário',
        error: 'Schedule Conflict',
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Horário indisponível
 */
export class TimeSlotUnavailableException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Este horário não está disponível para agendamento',
        error: 'Time Slot Unavailable',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/**
 * Validação de arquivo falhou
 */
export class FileValidationException extends HttpException {
  constructor(message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        message,
        error: 'File Validation Error',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
