import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission, hasAllPermissions } from '../permissions/permissions';

/**
 * Guard que verifica se o usuário tem as permissões necessárias
 * Deve ser usado APÓS o JwtAuthGuard
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se não há permissões definidas, permite acesso
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Acesso negado');
    }

    // SUPER_ADMIN tem acesso a tudo
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Verifica se o usuário tem todas as permissões requeridas
    const hasPermission = hasAllPermissions(user.role, requiredPermissions);

    if (!hasPermission) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso',
      );
    }

    return true;
  }
}
