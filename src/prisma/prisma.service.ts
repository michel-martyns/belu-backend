import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

// Models que suportam soft delete
const SOFT_DELETE_MODELS = ['Service', 'Provider', 'Client'];

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();

    // Middleware para soft delete
    this.$use(async (params, next) => {
      const model = params.model as string;

      // Só aplica soft delete para os modelos configurados
      if (!SOFT_DELETE_MODELS.includes(model)) {
        return next(params);
      }

      // Intercepta operações de delete e converte para update
      if (params.action === 'delete') {
        params.action = 'update';
        params.args['data'] = { deletedAt: new Date() };
        return next(params);
      }

      if (params.action === 'deleteMany') {
        params.action = 'updateMany';
        if (params.args.data !== undefined) {
          params.args.data['deletedAt'] = new Date();
        } else {
          params.args['data'] = { deletedAt: new Date() };
        }
        return next(params);
      }

      // Intercepta operações de leitura para filtrar deletados
      if (params.action === 'findUnique' || params.action === 'findFirst') {
        // Muda para findFirst para poder adicionar o filtro deletedAt
        params.action = 'findFirst';
        // Adiciona filtro para não mostrar deletados
        params.args.where = {
          ...params.args.where,
          deletedAt: null,
        };
        return next(params);
      }

      if (params.action === 'findMany') {
        // Adiciona filtro para não mostrar deletados (se não foi explicitamente pedido)
        if (!params.args) {
          params.args = { where: { deletedAt: null } };
        } else if (!params.args.where) {
          params.args.where = { deletedAt: null };
        } else if (params.args.where.deletedAt === undefined) {
          params.args.where.deletedAt = null;
        }
        return next(params);
      }

      if (params.action === 'count') {
        if (!params.args) {
          params.args = { where: { deletedAt: null } };
        } else if (!params.args.where) {
          params.args.where = { deletedAt: null };
        } else if (params.args.where.deletedAt === undefined) {
          params.args.where.deletedAt = null;
        }
        return next(params);
      }

      // Update e updateMany também devem verificar se não está deletado
      if (params.action === 'update') {
        params.action = 'updateMany';
        params.args.where = {
          ...params.args.where,
          deletedAt: null,
        };
        const result = await next(params);
        // Retorna null se nenhum registro foi atualizado
        if (result.count === 0) {
          return null;
        }
        // Busca o registro atualizado para retornar
        return this[model.toLowerCase()].findFirst({
          where: params.args.where,
        });
      }

      if (params.action === 'updateMany') {
        if (!params.args.where) {
          params.args.where = { deletedAt: null };
        } else if (params.args.where.deletedAt === undefined) {
          params.args.where.deletedAt = null;
        }
        return next(params);
      }

      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Busca registros incluindo deletados (para admin/restauração)
   */
  async findWithDeleted<T>(
    model: 'service' | 'provider' | 'client',
    args: any,
  ): Promise<T[]> {
    // Força a inclusão de deletados
    if (!args.where) {
      args.where = {};
    }
    // Remove o filtro deletedAt para mostrar todos
    delete args.where.deletedAt;
    args.where.OR = [
      { deletedAt: null },
      { deletedAt: { not: null } },
    ];
    return (this as any)[model].findMany(args);
  }

  /**
   * Busca apenas registros deletados (para lixeira)
   */
  async findOnlyDeleted<T>(
    model: 'service' | 'provider' | 'client',
    args: any = {},
  ): Promise<T[]> {
    if (!args.where) {
      args.where = {};
    }
    args.where.deletedAt = { not: null };
    return (this as any)[model].findMany(args);
  }

  /**
   * Restaura um registro deletado
   */
  async restore<T>(
    model: 'service' | 'provider' | 'client',
    where: any,
  ): Promise<T> {
    return (this as any)[model].updateMany({
      where: {
        ...where,
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    });
  }

  /**
   * Deleta permanentemente (hard delete)
   */
  async hardDelete(
    model: 'service' | 'provider' | 'client',
    where: any,
  ): Promise<any> {
    // Usa $executeRaw para bypass do middleware
    const modelName = model.charAt(0).toUpperCase() + model.slice(1);
    return this.$executeRawUnsafe(
      `DELETE FROM "${modelName}" WHERE id = $1`,
      where.id,
    );
  }
}
