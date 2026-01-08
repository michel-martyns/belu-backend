import { SetMetadata } from '@nestjs/common';
import { Permission } from '../permissions/permissions';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator para definir quais permissões são necessárias para acessar um endpoint
 *
 * @example
 * // Requer permissão de criar clientes
 * @RequirePermissions(Permission.CLIENTS_CREATE)
 * @Post()
 * create() { ... }
 *
 * @example
 * // Requer múltiplas permissões (todas necessárias)
 * @RequirePermissions(Permission.FINANCIAL_VIEW, Permission.REPORTS_EXPORT)
 * @Get('financial-report')
 * getReport() { ... }
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Alias para RequirePermissions
 */
export const Permissions = RequirePermissions;
