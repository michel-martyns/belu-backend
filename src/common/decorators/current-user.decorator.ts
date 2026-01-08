import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface CurrentUserData {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof CurrentUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentUserData;

    // Se especificou uma propriedade, retorna apenas ela
    if (data) {
      return user[data];
    }

    return user;
  },
);

/**
 * Decorator para extrair apenas o tenantId do usuário atual
 * Útil para usar diretamente nos services
 */
export const TenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId;
  },
);
