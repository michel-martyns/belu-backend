import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Decorator para definir quais roles podem acessar um endpoint
 *
 * @example
 * // Apenas ADMIN e MANAGER podem acessar
 * @Roles(UserRole.ADMIN, UserRole.MANAGER)
 * @Get('admin-only')
 * adminOnly() { ... }
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Decorator para endpoints que requerem apenas ADMIN
 */
export const AdminOnly = () => SetMetadata(ROLES_KEY, [UserRole.ADMIN]);

/**
 * Decorator para endpoints que requerem ADMIN ou MANAGER
 */
export const ManagerOrAbove = () =>
  SetMetadata(ROLES_KEY, [UserRole.ADMIN, UserRole.MANAGER]);
