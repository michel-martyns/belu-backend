import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Guard que verifica se o tenant do usuário está ativo
 * Deve ser usado APÓS o JwtAuthGuard
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Acesso negado: tenant não identificado');
    }

    // Verifica se o tenant está ativo
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { isActive: true, plan: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Acesso negado: tenant não encontrado');
    }

    if (!tenant.isActive) {
      throw new ForbiddenException(
        'Acesso negado: sua conta está desativada. Entre em contato com o suporte.',
      );
    }

    // Adiciona informações do tenant na request para uso posterior
    request.tenant = tenant;

    return true;
  }
}
