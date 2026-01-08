import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, Prisma } from '@prisma/client';
import { QueryAuditLogsDto, CreateAuditLogDto, AuditStatsDto } from './dto/audit.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Cria um novo log de auditoria
   */
  async create(data: CreateAuditLogDto) {
    try {
      const log = await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          oldValue: data.oldValue ? data.oldValue : undefined,
          newValue: data.newValue ? data.newValue : undefined,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
          endpoint: data.endpoint,
          method: data.method,
          description: data.description,
          metadata: data.metadata ? data.metadata : undefined,
        },
      });

      this.logger.debug(
        `Audit log created: ${data.action} on ${data.entity}${data.entityId ? ` (${data.entityId})` : ''} by user ${data.userId || 'system'}`,
      );

      return log;
    } catch (error) {
      this.logger.error(`Failed to create audit log: ${error.message}`);
      // Não lançar erro para não afetar a operação principal
      return null;
    }
  }

  /**
   * Cria log de auditoria de forma assíncrona (fire and forget)
   */
  async logAsync(data: CreateAuditLogDto): Promise<void> {
    // Executa em background sem bloquear
    setImmediate(() => {
      this.create(data).catch((err) => {
        this.logger.error(`Async audit log failed: ${err.message}`);
      });
    });
  }

  /**
   * Busca logs de auditoria com filtros e paginação
   */
  async findAll(tenantId: string, query: QueryAuditLogsDto) {
    const {
      action,
      entity,
      entityId,
      userId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.AuditLogWhereInput = {
      tenantId,
    };

    if (action) {
      where.action = action;
    }

    if (entity) {
      where.entity = entity;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (userId) {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.createdAt.lte = new Date(endDate);
      }
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { endpoint: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Busca um log de auditoria por ID
   */
  async findOne(id: string, tenantId: string) {
    return this.prisma.auditLog.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Busca logs por entidade específica
   */
  async findByEntity(entity: string, entityId: string, tenantId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entity,
        entityId,
        tenantId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Busca logs por usuário
   */
  async findByUser(userId: string, tenantId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: {
        userId,
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Obtém estatísticas de auditoria
   */
  async getStats(tenantId: string, startDate?: Date, endDate?: Date): Promise<AuditStatsDto> {
    const where: Prisma.AuditLogWhereInput = {
      tenantId,
    };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    // Total de logs
    const totalLogs = await this.prisma.auditLog.count({ where });

    // Logs por ação
    const logsByActionRaw = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: {
        action: true,
      },
    });

    const logsByAction: Record<string, number> = {};
    logsByActionRaw.forEach((item) => {
      logsByAction[item.action] = item._count.action;
    });

    // Logs por entidade
    const logsByEntityRaw = await this.prisma.auditLog.groupBy({
      by: ['entity'],
      where,
      _count: {
        entity: true,
      },
      orderBy: {
        _count: {
          entity: 'desc',
        },
      },
      take: 10,
    });

    const logsByEntity: Record<string, number> = {};
    logsByEntityRaw.forEach((item) => {
      logsByEntity[item.entity] = item._count.entity;
    });

    // Logs por usuário (top 10)
    const logsByUserRaw = await this.prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        ...where,
        userId: { not: null },
      },
      _count: {
        userId: true,
      },
      orderBy: {
        _count: {
          userId: 'desc',
        },
      },
      take: 10,
    });

    const userIds = logsByUserRaw
      .map((item) => item.userId)
      .filter((id): id is string => id !== null);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const logsByUser = logsByUserRaw.map((item) => ({
      userId: item.userId || '',
      userName: userMap.get(item.userId || '') || 'Unknown',
      count: item._count.userId,
    }));

    // Atividade recente (últimos 7 dias)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivityRaw = await this.prisma.$queryRaw<
      Array<{ date: Date; count: bigint }>
    >`
      SELECT DATE(\"createdAt\") as date, COUNT(*) as count
      FROM "AuditLog"
      WHERE "tenantId" = ${tenantId}
        AND "createdAt" >= ${sevenDaysAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    const recentActivity = recentActivityRaw.map((item) => ({
      date: item.date.toISOString().split('T')[0],
      count: Number(item.count),
    }));

    return {
      totalLogs,
      logsByAction,
      logsByEntity,
      logsByUser,
      recentActivity,
    };
  }

  /**
   * Busca ações recentes do tenant
   */
  async getRecentActivity(tenantId: string, limit = 20) {
    return this.prisma.auditLog.findMany({
      where: {
        tenantId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Limpa logs antigos (para manutenção)
   */
  async cleanOldLogs(tenantId: string, olderThanDays: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.auditLog.deleteMany({
      where: {
        tenantId,
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    this.logger.log(
      `Cleaned ${result.count} audit logs older than ${olderThanDays} days for tenant ${tenantId}`,
    );

    return result;
  }

  /**
   * Exporta logs para JSON
   */
  async exportLogs(tenantId: string, query: QueryAuditLogsDto) {
    // Remove paginação para exportar todos
    const { page, limit, ...filters } = query;

    const logs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        action: filters.action,
        entity: filters.entity,
        entityId: filters.entityId,
        userId: filters.userId,
        createdAt: filters.startDate || filters.endDate
          ? {
              gte: filters.startDate ? new Date(filters.startDate) : undefined,
              lte: filters.endDate ? new Date(filters.endDate) : undefined,
            }
          : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return logs;
  }

  // ============================================================================
  // HELPER METHODS - Para uso em outros serviços
  // ============================================================================

  /**
   * Log de criação de entidade
   */
  async logCreate(params: {
    tenantId: string;
    userId?: string;
    entity: string;
    entityId: string;
    newValue: any;
    ipAddress?: string;
    userAgent?: string;
    endpoint?: string;
  }) {
    return this.logAsync({
      ...params,
      action: AuditAction.CREATE,
      description: `Created ${params.entity} ${params.entityId}`,
    });
  }

  /**
   * Log de atualização de entidade
   */
  async logUpdate(params: {
    tenantId: string;
    userId?: string;
    entity: string;
    entityId: string;
    oldValue: any;
    newValue: any;
    ipAddress?: string;
    userAgent?: string;
    endpoint?: string;
  }) {
    return this.logAsync({
      ...params,
      action: AuditAction.UPDATE,
      description: `Updated ${params.entity} ${params.entityId}`,
    });
  }

  /**
   * Log de exclusão de entidade
   */
  async logDelete(params: {
    tenantId: string;
    userId?: string;
    entity: string;
    entityId: string;
    oldValue?: any;
    ipAddress?: string;
    userAgent?: string;
    endpoint?: string;
  }) {
    return this.logAsync({
      ...params,
      action: AuditAction.DELETE,
      description: `Deleted ${params.entity} ${params.entityId}`,
    });
  }

  /**
   * Log de login
   */
  async logLogin(params: {
    tenantId: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    success: boolean;
  }) {
    return this.logAsync({
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.success ? AuditAction.LOGIN : AuditAction.LOGIN_FAILED,
      entity: 'User',
      entityId: params.userId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      description: params.success
        ? `User logged in`
        : `Failed login attempt`,
    });
  }

  /**
   * Log de logout
   */
  async logLogout(params: {
    tenantId: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.logAsync({
      ...params,
      action: AuditAction.LOGOUT,
      entity: 'User',
      entityId: params.userId,
      description: `User logged out`,
    });
  }

  /**
   * Log customizado
   */
  async logCustom(params: {
    tenantId: string;
    userId?: string;
    entity: string;
    entityId?: string;
    description: string;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.logAsync({
      ...params,
      action: AuditAction.CUSTOM,
    });
  }
}
