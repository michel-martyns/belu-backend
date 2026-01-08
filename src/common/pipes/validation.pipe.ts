import {
  ValidationPipe,
  ValidationError,
  BadRequestException,
} from '@nestjs/common';

/**
 * Mensagens de validação em português
 */
const validationMessages: Record<string, string> = {
  isNotEmpty: 'O campo $property é obrigatório',
  isString: 'O campo $property deve ser um texto',
  isNumber: 'O campo $property deve ser um número',
  isInt: 'O campo $property deve ser um número inteiro',
  isPositive: 'O campo $property deve ser um número positivo',
  isEmail: 'O campo $property deve ser um email válido',
  minLength: 'O campo $property deve ter no mínimo $constraint1 caracteres',
  maxLength: 'O campo $property deve ter no máximo $constraint1 caracteres',
  min: 'O campo $property deve ser no mínimo $constraint1',
  max: 'O campo $property deve ser no máximo $constraint1',
  isEnum: 'O campo $property deve ser um dos valores permitidos',
  isUUID: 'O campo $property deve ser um UUID válido',
  isDate: 'O campo $property deve ser uma data válida',
  isBoolean: 'O campo $property deve ser verdadeiro ou falso',
  isArray: 'O campo $property deve ser uma lista',
  arrayMinSize: 'O campo $property deve ter no mínimo $constraint1 itens',
  arrayMaxSize: 'O campo $property deve ter no máximo $constraint1 itens',
  matches: 'O campo $property está em formato inválido',
  isPhoneNumber: 'O campo $property deve ser um telefone válido',
  isUrl: 'O campo $property deve ser uma URL válida',
  isOptional: '',
};

/**
 * Nomes amigáveis para os campos
 */
const fieldNames: Record<string, string> = {
  email: 'email',
  password: 'senha',
  name: 'nome',
  phone: 'telefone',
  description: 'descrição',
  price: 'preço',
  duration: 'duração',
  date: 'data',
  startTime: 'horário de início',
  endTime: 'horário de término',
  clientId: 'cliente',
  providerId: 'profissional',
  serviceId: 'serviço',
  tenantId: 'clínica',
  notes: 'observações',
  active: 'ativo',
  status: 'status',
  slug: 'URL',
  businessName: 'nome do negócio',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  address: 'endereço',
  role: 'função',
  dayOfWeek: 'dia da semana',
  isAvailable: 'disponível',
  customPrice: 'preço personalizado',
  confirmPassword: 'confirmação de senha',
  token: 'token',
};

/**
 * Formata uma mensagem de erro de validação
 */
function formatValidationError(error: ValidationError): string[] {
  const messages: string[] = [];
  const fieldName = fieldNames[error.property] || error.property;

  if (error.constraints) {
    for (const [key, message] of Object.entries(error.constraints)) {
      // Usa mensagem customizada se existir, senão usa a do class-validator
      let formattedMessage = validationMessages[key] || message;

      // Substitui placeholders
      formattedMessage = formattedMessage
        .replace('$property', fieldName)
        .replace(/\$constraint1/g, (error as any).constraints?.[key]?.match(/\d+/)?.[0] || '');

      messages.push(formattedMessage);
    }
  }

  // Processa erros aninhados
  if (error.children && error.children.length > 0) {
    for (const child of error.children) {
      messages.push(...formatValidationError(child));
    }
  }

  return messages;
}

/**
 * ValidationPipe customizado com mensagens em português
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true, // Remove campos não decorados
    forbidNonWhitelisted: true, // Erro se enviar campos não permitidos
    transform: true, // Transforma tipos automaticamente
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors: ValidationError[]) => {
      const messages: string[] = [];

      for (const error of errors) {
        messages.push(...formatValidationError(error));
      }

      return new BadRequestException({
        statusCode: 400,
        message: messages,
        error: 'Validation Error',
      });
    },
  });
}
