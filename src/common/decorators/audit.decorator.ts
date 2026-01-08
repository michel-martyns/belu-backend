import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

export const AUDIT_KEY = 'audit';
export const SKIP_AUDIT_KEY = 'skipAudit';

export interface AuditMetadata {
  action: AuditAction;
  entity: string;
  getEntityId?: (request: any, response: any) => string | undefined;
  getOldValue?: (request: any) => any;
  getNewValue?: (request: any, response: any) => any;
  description?: string | ((request: any, response: any) => string);
}

/**
 * Decorator para marcar um endpoint para auditoria
 *
 * @example
 * // Auditoria básica
 * @Audit({ action: AuditAction.CREATE, entity: 'Client' })
 * @Post()
 * create(@Body() dto: CreateClientDto) { ... }
 *
 * @example
 * // Com extração customizada de IDs
 * @Audit({
 *   action: AuditAction.UPDATE,
 *   entity: 'Client',
 *   getEntityId: (req) => req.params.id,
 *   getNewValue: (req) => req.body
 * })
 * @Put(':id')
 * update(@Param('id') id: string, @Body() dto: UpdateClientDto) { ... }
 */
export const Audit = (metadata: AuditMetadata) => SetMetadata(AUDIT_KEY, metadata);

/**
 * Decorator para pular auditoria em um endpoint específico
 * Útil quando o controller tem auditoria global mas um endpoint não precisa
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);

/**
 * Decorator para auditoria de criação
 */
export const AuditCreate = (entity: string, options?: Partial<AuditMetadata>) =>
  Audit({
    action: AuditAction.CREATE,
    entity,
    getEntityId: (req, res) => res?.id || res?.data?.id,
    getNewValue: (req) => req.body,
    ...options,
  });

/**
 * Decorator para auditoria de leitura
 */
export const AuditRead = (entity: string, options?: Partial<AuditMetadata>) =>
  Audit({
    action: AuditAction.READ,
    entity,
    getEntityId: (req) => req.params?.id,
    ...options,
  });

/**
 * Decorator para auditoria de atualização
 */
export const AuditUpdate = (entity: string, options?: Partial<AuditMetadata>) =>
  Audit({
    action: AuditAction.UPDATE,
    entity,
    getEntityId: (req) => req.params?.id,
    getNewValue: (req) => req.body,
    ...options,
  });

/**
 * Decorator para auditoria de exclusão
 */
export const AuditDelete = (entity: string, options?: Partial<AuditMetadata>) =>
  Audit({
    action: AuditAction.DELETE,
    entity,
    getEntityId: (req) => req.params?.id,
    ...options,
  });

/**
 * Decorator para auditoria de login
 */
export const AuditLogin = () =>
  Audit({
    action: AuditAction.LOGIN,
    entity: 'User',
    getEntityId: (req, res) => res?.user?.sub || res?.user?.id,
    description: 'User logged in',
  });

/**
 * Decorator para auditoria de logout
 */
export const AuditLogout = () =>
  Audit({
    action: AuditAction.LOGOUT,
    entity: 'User',
    getEntityId: (req) => req.user?.sub,
    description: 'User logged out',
  });

/**
 * Decorator para auditoria de exportação
 */
export const AuditExport = (entity: string) =>
  Audit({
    action: AuditAction.EXPORT,
    entity,
    description: (req) => `Exported ${entity} data`,
  });

/**
 * Decorator para auditoria de ação customizada
 */
export const AuditCustom = (
  entity: string,
  description: string | ((request: any, response: any) => string),
) =>
  Audit({
    action: AuditAction.CUSTOM,
    entity,
    description,
  });
