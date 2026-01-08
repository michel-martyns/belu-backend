import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PLAN_FEATURE_KEY, PLAN_LIMIT_KEY, PlanLimitType } from '../decorators/plan-feature.decorator';
import { hasFeature, getPlanLimits } from '../permissions/permissions';

/**
 * Guard que verifica se o plano do tenant tem a feature necessária
 * Deve ser usado APÓS o JwtAuthGuard e TenantGuard
 */
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      PLAN_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se não há feature definida, permite acesso
    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Acesso negado');
    }

    // Busca o tenant para verificar o plano
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { plan: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant não encontrado');
    }

    // Verifica se o plano tem a feature
    const hasPlanFeature = hasFeature(tenant.plan, requiredFeature);

    if (!hasPlanFeature) {
      throw new ForbiddenException(
        `Esta funcionalidade não está disponível no seu plano. Faça upgrade para acessar.`,
      );
    }

    return true;
  }
}

/**
 * Guard que verifica se o tenant atingiu o limite do plano
 * Deve ser usado APÓS o JwtAuthGuard e TenantGuard
 */
@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limitType = this.reflector.getAllAndOverride<PlanLimitType>(
      PLAN_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se não há limite definido, permite acesso
    if (!limitType) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Acesso negado');
    }

    // Busca o tenant para verificar o plano
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { plan: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant não encontrado');
    }

    const limits = getPlanLimits(tenant.plan);
    const maxLimit = limits[limitType];

    // -1 significa ilimitado
    if (maxLimit === -1) {
      return true;
    }

    // Conta os recursos atuais
    const currentCount = await this.countResources(user.tenantId, limitType);

    if (currentCount >= maxLimit) {
      const limitNames: Record<PlanLimitType, string> = {
        maxUsers: 'usuários',
        maxClients: 'clientes',
        maxProviders: 'profissionais',
        maxAppointmentsPerMonth: 'agendamentos este mês',
      };

      throw new ForbiddenException(
        `Você atingiu o limite de ${maxLimit} ${limitNames[limitType]} do seu plano. Faça upgrade para continuar.`,
      );
    }

    return true;
  }

  private async countResources(
    tenantId: string,
    limitType: PlanLimitType,
  ): Promise<number> {
    switch (limitType) {
      case 'maxUsers':
        return this.prisma.user.count({
          where: { tenantId, isActive: true },
        });

      case 'maxClients':
        return this.prisma.client.count({
          where: { tenantId },
        });

      case 'maxProviders':
        return this.prisma.provider.count({
          where: { tenantId, active: true },
        });

      case 'maxAppointmentsPerMonth':
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date(startOfMonth);
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);

        return this.prisma.appointment.count({
          where: {
            tenantId,
            date: {
              gte: startOfMonth,
              lt: endOfMonth,
            },
          },
        });

      default:
        return 0;
    }
  }
}
