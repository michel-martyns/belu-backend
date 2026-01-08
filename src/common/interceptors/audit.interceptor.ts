import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from '../../modules/audit/audit.service';
import {
  AUDIT_KEY,
  SKIP_AUDIT_KEY,
  AuditMetadata,
} from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Verificar se deve pular auditoria
    const skipAudit = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipAudit) {
      return next.handle();
    }

    // Obter metadados de auditoria
    const auditMetadata = this.reflector.getAllAndOverride<AuditMetadata>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditMetadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (response) => {
          this.logAudit(request, response, auditMetadata, startTime, true);
        },
        error: (error) => {
          this.logAudit(request, null, auditMetadata, startTime, false, error);
        },
      }),
    );
  }

  private async logAudit(
    request: any,
    response: any,
    metadata: AuditMetadata,
    startTime: number,
    success: boolean,
    error?: any,
  ): Promise<void> {
    try {
      const user = request.user;
      const tenantId = user?.tenantId;
      const userId = user?.sub || user?.id;

      // Não logar se não houver tenant (requisições públicas)
      if (!tenantId) {
        return;
      }

      // Extrair entity ID
      let entityId: string | undefined;
      if (metadata.getEntityId) {
        entityId = metadata.getEntityId(request, response);
      }

      // Extrair old value (se definido)
      let oldValue: any;
      if (metadata.getOldValue) {
        oldValue = metadata.getOldValue(request);
      }

      // Extrair new value (se definido)
      let newValue: any;
      if (metadata.getNewValue) {
        newValue = metadata.getNewValue(request, response);
      }

      // Construir descrição
      let description: string | undefined;
      if (typeof metadata.description === 'function') {
        description = metadata.description(request, response);
      } else if (metadata.description) {
        description = metadata.description;
      } else {
        description = this.buildDefaultDescription(metadata, entityId, success);
      }

      // Adicionar informação de erro se falhou
      const auditMetadata: Record<string, any> = {};
      if (!success && error) {
        auditMetadata.error = {
          message: error.message,
          status: error.status || 500,
        };
      }
      auditMetadata.duration = Date.now() - startTime;

      // Logar de forma assíncrona
      await this.auditService.logAsync({
        tenantId,
        userId,
        action: metadata.action,
        entity: metadata.entity,
        entityId,
        oldValue,
        newValue,
        ipAddress: this.getClientIp(request),
        userAgent: request.get('user-agent'),
        endpoint: request.url,
        method: request.method,
        description,
        metadata: Object.keys(auditMetadata).length > 0 ? auditMetadata : undefined,
      });
    } catch (err) {
      this.logger.error(`Failed to create audit log: ${err.message}`);
    }
  }

  private buildDefaultDescription(
    metadata: AuditMetadata,
    entityId?: string,
    success?: boolean,
  ): string {
    const action = metadata.action.toLowerCase().replace('_', ' ');
    const entity = metadata.entity;
    const id = entityId ? ` (${entityId})` : '';
    const status = success ? '' : ' [FAILED]';

    return `${action} ${entity}${id}${status}`;
  }

  private getClientIp(request: any): string | undefined {
    // Tentar obter o IP real do cliente (considerando proxies)
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.connection?.remoteAddress;
  }
}
