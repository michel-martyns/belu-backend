import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentClientData {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone: string;
  type: 'CLIENT';
}

export const CurrentClient = createParamDecorator(
  (data: keyof CurrentClientData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const client = request.user as CurrentClientData;

    // Se especificou uma propriedade, retorna apenas ela
    if (data) {
      return client[data];
    }

    return client;
  },
);

/**
 * Decorator para extrair apenas o tenantId do cliente atual
 */
export const ClientTenantId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.tenantId;
  },
);
