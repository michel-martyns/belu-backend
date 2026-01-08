import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  CreateStockMovementDto,
  StockAdjustmentDto,
  CreateServiceProductDto,
  UpdateServiceProductDto,
  QueryProductsDto,
  QueryStockMovementsDto,
} from './dto';
import { StockMovementType, Prisma } from '@prisma/client';

@Injectable()
export class InventoryService {
  private readonly CACHE_PREFIX = 'inventory';
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // PRODUCT CATEGORIES
  // ============================================================================

  async findAllCategories(tenantId: string) {
    const cacheKey = `${this.CACHE_PREFIX}:${tenantId}:categories`;
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) return JSON.parse(cached);

    const categories = await this.prisma.productCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    await this.redis.set(cacheKey, JSON.stringify(categories), this.CACHE_TTL);
    return categories;
  }

  async findCategoryById(id: string, tenantId: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id, tenantId },
      include: {
        products: {
          where: { isActive: true, deletedAt: null },
          take: 10,
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    return category;
  }

  async createCategory(tenantId: string, dto: CreateProductCategoryDto) {
    const category = await this.prisma.productCategory.create({
      data: {
        tenantId,
        ...dto,
      },
    });

    await this.invalidateCategoriesCache(tenantId);
    return category;
  }

  async updateCategory(
    id: string,
    tenantId: string,
    dto: UpdateProductCategoryDto,
  ) {
    await this.findCategoryById(id, tenantId);

    const category = await this.prisma.productCategory.update({
      where: { id },
      data: dto,
    });

    await this.invalidateCategoriesCache(tenantId);
    return category;
  }

  async deleteCategory(id: string, tenantId: string) {
    const category = await this.findCategoryById(id, tenantId);

    // Verificar se há produtos vinculados
    const productsCount = await this.prisma.product.count({
      where: { categoryId: id, deletedAt: null },
    });

    if (productsCount > 0) {
      throw new BadRequestException(
        `Não é possível excluir categoria com ${productsCount} produto(s) vinculado(s)`,
      );
    }

    await this.prisma.productCategory.delete({ where: { id } });
    await this.invalidateCategoriesCache(tenantId);

    return { message: 'Categoria excluída com sucesso' };
  }

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  async findAllProducts(tenantId: string, query?: QueryProductsDto) {
    const where: Prisma.ProductWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query?.productType) {
      where.productType = query.productType;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.lowStock) {
      // Filtrar produtos com estoque baixo (currentStock <= minStock)
      // Esta query será filtrada no código após buscar os produtos
      where.isActive = true;
    }

    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
        },
        orderBy: { name: 'asc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: products,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findProductById(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        category: true,
        serviceProducts: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    return product;
  }

  async createProduct(tenantId: string, dto: CreateProductDto) {
    // Verificar SKU único se fornecido
    if (dto.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { tenantId, sku: dto.sku, deletedAt: null },
      });
      if (existingSku) {
        throw new ConflictException('SKU já está em uso');
      }
    }

    // Verificar código de barras único se fornecido
    if (dto.barcode) {
      const existingBarcode = await this.prisma.product.findFirst({
        where: { tenantId, barcode: dto.barcode, deletedAt: null },
      });
      if (existingBarcode) {
        throw new ConflictException('Código de barras já está em uso');
      }
    }

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        ...dto,
      },
      include: {
        category: true,
      },
    });

    await this.invalidateProductsCache(tenantId);
    return product;
  }

  async updateProduct(id: string, tenantId: string, dto: UpdateProductDto) {
    const product = await this.findProductById(id, tenantId);

    // Verificar SKU único se fornecido e diferente
    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { tenantId, sku: dto.sku, deletedAt: null, NOT: { id } },
      });
      if (existingSku) {
        throw new ConflictException('SKU já está em uso');
      }
    }

    // Verificar código de barras único se fornecido e diferente
    if (dto.barcode && dto.barcode !== product.barcode) {
      const existingBarcode = await this.prisma.product.findFirst({
        where: { tenantId, barcode: dto.barcode, deletedAt: null, NOT: { id } },
      });
      if (existingBarcode) {
        throw new ConflictException('Código de barras já está em uso');
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: {
        category: true,
      },
    });

    await this.invalidateProductsCache(tenantId);
    return updated;
  }

  async deleteProduct(id: string, tenantId: string) {
    await this.findProductById(id, tenantId);

    // Soft delete
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.invalidateProductsCache(tenantId);
    return { message: 'Produto excluído com sucesso' };
  }

  // ============================================================================
  // STOCK MOVEMENTS
  // ============================================================================

  async findAllMovements(tenantId: string, query?: QueryStockMovementsDto) {
    const where: Prisma.StockMovementWhereInput = { tenantId };

    if (query?.productId) {
      where.productId = query.productId;
    }

    if (query?.type) {
      where.type = query.type;
    }

    if (query?.providerId) {
      where.providerId = query.providerId;
    }

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [movements, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          product: true,
          provider: true,
          appointment: {
            include: {
              client: true,
              service: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      data: movements,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async createMovement(
    tenantId: string,
    dto: CreateStockMovementDto,
    userId?: string,
  ) {
    const product = await this.findProductById(dto.productId, tenantId);

    // Calcular nova quantidade baseado no tipo de movimentação
    let quantityChange = dto.quantity;
    if (this.isOutboundMovement(dto.type)) {
      quantityChange = -dto.quantity;
    }

    const newStock = product.currentStock + quantityChange;

    // Verificar se há estoque suficiente para saídas
    if (newStock < 0) {
      throw new BadRequestException(
        `Estoque insuficiente. Disponível: ${product.currentStock}`,
      );
    }

    // Calcular custo total
    const unitCost = dto.unitCost || Number(product.costPrice);
    const totalCost = unitCost * dto.quantity;

    const movement = await this.prisma.$transaction(async (prisma) => {
      // Criar movimentação
      const mov = await prisma.stockMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          type: dto.type,
          quantity: quantityChange,
          unitCost,
          totalCost,
          previousStock: product.currentStock,
          currentStock: newStock,
          description: dto.description,
          reference: dto.reference,
          appointmentId: dto.appointmentId,
          providerId: dto.providerId,
          supplierId: dto.supplierId,
          createdBy: userId,
        },
        include: {
          product: true,
        },
      });

      // Atualizar estoque do produto
      await prisma.product.update({
        where: { id: dto.productId },
        data: { currentStock: newStock },
      });

      return mov;
    });

    await this.invalidateProductsCache(tenantId);
    return movement;
  }

  async adjustStock(tenantId: string, dto: StockAdjustmentDto, userId?: string) {
    const product = await this.findProductById(dto.productId, tenantId);

    const quantityDiff = dto.newQuantity - product.currentStock;

    if (quantityDiff === 0) {
      return product;
    }

    const movement = await this.prisma.$transaction(async (prisma) => {
      // Criar movimentação de ajuste
      const mov = await prisma.stockMovement.create({
        data: {
          tenantId,
          productId: dto.productId,
          type: StockMovementType.ADJUSTMENT,
          quantity: quantityDiff,
          previousStock: product.currentStock,
          currentStock: dto.newQuantity,
          description: dto.reason || 'Ajuste de inventário',
          createdBy: userId,
        },
        include: {
          product: true,
        },
      });

      // Atualizar estoque do produto
      await prisma.product.update({
        where: { id: dto.productId },
        data: { currentStock: dto.newQuantity },
      });

      return mov;
    });

    await this.invalidateProductsCache(tenantId);
    return movement;
  }

  // ============================================================================
  // SERVICE PRODUCTS (Consumo automático)
  // ============================================================================

  async findServiceProducts(tenantId: string, serviceId: string) {
    return this.prisma.serviceProduct.findMany({
      where: { tenantId, serviceId },
      include: {
        product: true,
        service: true,
      },
    });
  }

  async createServiceProduct(tenantId: string, dto: CreateServiceProductDto) {
    // Verificar se o serviço existe
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId, deletedAt: null },
    });
    if (!service) {
      throw new NotFoundException('Serviço não encontrado');
    }

    // Verificar se o produto existe
    await this.findProductById(dto.productId, tenantId);

    // Verificar se já existe vínculo
    const existing = await this.prisma.serviceProduct.findUnique({
      where: {
        serviceId_productId: {
          serviceId: dto.serviceId,
          productId: dto.productId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Produto já vinculado a este serviço');
    }

    return this.prisma.serviceProduct.create({
      data: {
        tenantId,
        serviceId: dto.serviceId,
        productId: dto.productId,
        quantity: dto.quantity || 1,
      },
      include: {
        product: true,
        service: true,
      },
    });
  }

  async updateServiceProduct(
    id: string,
    tenantId: string,
    dto: UpdateServiceProductDto,
  ) {
    const serviceProduct = await this.prisma.serviceProduct.findFirst({
      where: { id, tenantId },
    });

    if (!serviceProduct) {
      throw new NotFoundException('Vínculo não encontrado');
    }

    return this.prisma.serviceProduct.update({
      where: { id },
      data: { quantity: dto.quantity },
      include: {
        product: true,
        service: true,
      },
    });
  }

  async deleteServiceProduct(id: string, tenantId: string) {
    const serviceProduct = await this.prisma.serviceProduct.findFirst({
      where: { id, tenantId },
    });

    if (!serviceProduct) {
      throw new NotFoundException('Vínculo não encontrado');
    }

    await this.prisma.serviceProduct.delete({ where: { id } });
    return { message: 'Vínculo removido com sucesso' };
  }

  // ============================================================================
  // CONSUMO AUTOMÁTICO - Consumir estoque ao finalizar atendimento
  // ============================================================================

  async consumeStockForAppointment(
    tenantId: string,
    appointmentId: string,
    userId?: string,
  ) {
    // Buscar o agendamento
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        service: {
          include: {
            serviceProducts: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    const serviceProducts = appointment.service.serviceProducts;

    if (serviceProducts.length === 0) {
      return { message: 'Nenhum produto configurado para consumo automático' };
    }

    const consumptions: any[] = [];

    for (const sp of serviceProducts) {
      try {
        const movement = await this.createMovement(
          tenantId,
          {
            productId: sp.productId,
            type: StockMovementType.CONSUMPTION,
            quantity: sp.quantity,
            description: `Consumo automático - ${appointment.service.name}`,
            appointmentId,
            providerId: appointment.providerId,
          },
          userId,
        );
        consumptions.push(movement);
      } catch (error) {
        // Log do erro mas continua para outros produtos
        console.error(
          `Erro ao consumir produto ${sp.product.name}: ${error.message}`,
        );
      }
    }

    return {
      message: `${consumptions.length} produto(s) consumido(s)`,
      movements: consumptions,
    };
  }

  // ============================================================================
  // ALERTAS DE ESTOQUE MÍNIMO
  // ============================================================================

  async getLowStockProducts(tenantId: string) {
    const products = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        sku: string;
        currentStock: number;
        minStock: number;
        unit: string;
      }>
    >`
      SELECT id, name, sku, "currentStock", "minStock", unit
      FROM "Product"
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND "isActive" = true
        AND "currentStock" <= "minStock"
      ORDER BY ("currentStock" - "minStock") ASC
    `;

    return products;
  }

  async getStockSummary(tenantId: string) {
    const summary = await this.prisma.product.aggregate({
      where: { tenantId, deletedAt: null, isActive: true },
      _count: true,
      _sum: {
        currentStock: true,
      },
    });

    const lowStockCount = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM "Product"
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND "isActive" = true
        AND "currentStock" <= "minStock"
    `;

    const totalValue = await this.prisma.$queryRaw<[{ total: number }]>`
      SELECT COALESCE(SUM("currentStock" * "costPrice"), 0) as total
      FROM "Product"
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND "isActive" = true
    `;

    return {
      totalProducts: summary._count,
      totalItems: summary._sum.currentStock || 0,
      lowStockCount: Number(lowStockCount[0]?.count || 0),
      totalValue: Number(totalValue[0]?.total || 0),
    };
  }

  async getMovementReport(tenantId: string, startDate: string, endDate: string) {
    const movements = await this.prisma.stockMovement.groupBy({
      by: ['type'],
      where: {
        tenantId,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate + 'T23:59:59.999Z'),
        },
      },
      _count: true,
      _sum: {
        quantity: true,
        totalCost: true,
      },
    });

    return movements.map((m) => ({
      type: m.type,
      count: m._count,
      totalQuantity: m._sum.quantity || 0,
      totalValue: Number(m._sum.totalCost || 0),
    }));
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private isOutboundMovement(type: StockMovementType): boolean {
    const outboundTypes: StockMovementType[] = [
      StockMovementType.SALE,
      StockMovementType.CONSUMPTION,
      StockMovementType.LOSS,
    ];
    return outboundTypes.includes(type);
  }

  private async invalidateCategoriesCache(tenantId: string) {
    const cacheKey = `${this.CACHE_PREFIX}:${tenantId}:categories`;
    await this.redis.del(cacheKey);
  }

  private async invalidateProductsCache(tenantId: string) {
    const pattern = `${this.CACHE_PREFIX}:${tenantId}:*`;
    await this.redis.delByPattern(pattern);
  }
}
