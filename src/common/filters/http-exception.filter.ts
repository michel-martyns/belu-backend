import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  details?: any;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor';
    let error = 'Internal Server Error';
    let details: any = undefined;

    // HttpException (NestJS exceptions)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || message;
        error = responseObj.error || this.getErrorName(statusCode);
      }
    }
    // Prisma Errors
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      statusCode = prismaError.statusCode;
      message = prismaError.message;
      error = prismaError.error;
    }
    // Prisma Validation Error
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'Erro de validação nos dados enviados';
      error = 'Validation Error';
    }
    // Generic Error
    else if (exception instanceof Error) {
      message = exception.message;
      // Em desenvolvimento, mostra mais detalhes
      if (process.env.NODE_ENV === 'development') {
        details = {
          stack: exception.stack,
        };
      }
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (details) {
      errorResponse.details = details;
    }

    // Log do erro
    this.logError(request, statusCode, exception);

    response.status(statusCode).json(errorResponse);
  }

  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string;
    error: string;
  } {
    switch (error.code) {
      case 'P2002':
        // Unique constraint violation
        const field = (error.meta?.target as string[])?.join(', ') || 'campo';
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Já existe um registro com este ${field}`,
          error: 'Conflict',
        };

      case 'P2003':
        // Foreign key constraint violation
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Referência inválida. O registro relacionado não existe',
          error: 'Bad Request',
        };

      case 'P2025':
        // Record not found
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registro não encontrado',
          error: 'Not Found',
        };

      case 'P2014':
        // Required relation violation
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'A operação viola uma relação obrigatória',
          error: 'Bad Request',
        };

      case 'P2016':
        // Query interpretation error
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Erro na interpretação da consulta',
          error: 'Bad Request',
        };

      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erro no banco de dados',
          error: 'Database Error',
        };
    }
  }

  private getErrorName(statusCode: number): string {
    const errorNames: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
    };
    return errorNames[statusCode] || 'Error';
  }

  private logError(request: Request, statusCode: number, exception: unknown) {
    const message = exception instanceof Error ? exception.message : 'Unknown error';
    const stack = exception instanceof Error ? exception.stack : undefined;

    const logMessage = `[${request.method}] ${request.url} - ${statusCode} - ${message}`;

    if (statusCode >= 500) {
      this.logger.error(logMessage, stack);
    } else if (statusCode >= 400) {
      this.logger.warn(logMessage);
    }
  }
}
