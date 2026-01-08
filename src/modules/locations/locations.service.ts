import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TransferStatus, StockMovementType, Prisma } from '@prisma/client';
import {
  CreateLocationDto,
  UpdateLocationDto,
  QueryLocationsDto,
  AssignProviderToLocationDto,
  UpdateProviderLocationDto,
  SetLocationInventoryDto,
  AdjustLocationInventoryDto,
  QueryLocationInventoryDto,
  CreateTransferDto,
  UpdateTransferStatusDto,
  QueryTransfersDto,
  ConsolidatedReportQueryDto,
  LocationResponseDto,
  LocationDetailResponseDto,
  ProviderLocationResponseDto,
  LocationInventoryResponseDto,
  TransferResponseDto,
} from './dto/locations.dto';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // Locations CRUD
  // ============================================================================

  async createLocation(
    tenantId: string,
    dto: CreateLocationDto,
  ): Promise<LocationDetailResponseDto> {
    const code = dto.code || await this.generateLocationCode(tenantId);
    const slug = dto.slug || this.generateSlug(dto.name);

    // Verificar duplicidade
    const existing = await this.prisma.location.findFirst({
      where: {
        tenantId,
        OR: [{ code }, { slug }],
      },
    });

    if (existing) {
      throw new ConflictException('Código ou slug já existe');
    }

    const location = await this.prisma.location.create({
      data: {
        tenantId,
        ...dto,
        code,
        slug,
        businessHours: dto.businessHours ? JSON.parse(JSON.stringify(dto.businessHours)) : undefined,
      },
    });

    return this.mapToDetailResponse(location);
  }

  async updateLocation(
    tenantId: string,
    locationId: string,
    dto: UpdateLocationDto,
  ): Promise<LocationDetailResponseDto> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
    });

    if (!location) {
      throw new NotFoundException('Unidade não encontrada');
    }

    // Verificar duplicidade se alterar code ou slug
    if (dto.code || dto.slug) {
      const existing = await this.prisma.location.findFirst({
        where: {
          tenantId,
          id: { not: locationId },
          OR: [
            ...(dto.code ? [{ code: dto.code }] : []),
            ...(dto.slug ? [{ slug: dto.slug }] : []),
          ],
        },
      });

      if (existing) {
        throw new ConflictException('Código ou slug já existe');
      }
    }

    const updateData = {
      ...dto,
      businessHours: dto.businessHours ? JSON.parse(JSON.stringify(dto.businessHours)) : undefined,
    };

    const updated = await this.prisma.location.update({
      where: { id: locationId },
      data: updateData,
    });

    return this.mapToDetailResponse(updated);
  }

  async getLocation(
    tenantId: string,
    locationId: string,
  ): Promise<LocationDetailResponseDto> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
      include: {
        providers: {
          where: { isActive: true },
          include: {
            provider: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException('Unidade não encontrada');
    }

    return this.mapToDetailResponse(location, location.providers);
  }

  async listLocations(
    tenantId: string,
    query: QueryLocationsDto,
  ): Promise<LocationResponseDto[]> {
    const where: Prisma.LocationWhereInput = {
      tenantId,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.isHeadquarters !== undefined && { isHeadquarters: query.isHeadquarters }),
      ...(query.city && { city: { contains: query.city, mode: 'insensitive' as const } }),
      ...(query.state && { state: query.state }),
    };

    const locations = await this.prisma.location.findMany({
      where,
      orderBy: [{ isHeadquarters: 'desc' }, { name: 'asc' }],
    });

    return Promise.all(
      locations.map(async (loc) => {
        const providersCount = await this.prisma.providerLocation.count({
          where: { locationId: loc.id, isActive: true },
        });

        const appointmentsToday = await this.prisma.appointmentLocation.count({
          where: {
            locationId: loc.id,
            appointment: {
              tenantId,
              date: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
                lt: new Date(new Date().setHours(23, 59, 59, 999)),
              },
            },
          },
        });

        return this.mapToResponse(loc, providersCount, appointmentsToday);
      }),
    );
  }

  async deleteLocation(tenantId: string, locationId: string): Promise<void> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
    });

    if (!location) {
      throw new NotFoundException('Unidade não encontrada');
    }

    // Verificar se há agendamentos futuros
    const futureAppointments = await this.prisma.appointmentLocation.count({
      where: {
        locationId,
        appointment: {
          date: { gte: new Date() },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      },
    });

    if (futureAppointments > 0) {
      throw new BadRequestException(
        `Não é possível excluir. Existem ${futureAppointments} agendamentos futuros nesta unidade.`,
      );
    }

    // Soft delete - apenas desativar
    await this.prisma.location.update({
      where: { id: locationId },
      data: { isActive: false },
    });
  }

  // ============================================================================
  // Provider Locations
  // ============================================================================

  async assignProviderToLocation(
    tenantId: string,
    dto: AssignProviderToLocationDto,
  ): Promise<ProviderLocationResponseDto> {
    const [provider, location] = await Promise.all([
      this.prisma.provider.findFirst({
        where: { id: dto.providerId, tenantId },
      }),
      this.prisma.location.findFirst({
        where: { id: dto.locationId, tenantId },
      }),
    ]);

    if (!provider) {
      throw new NotFoundException('Profissional não encontrado');
    }
    if (!location) {
      throw new NotFoundException('Unidade não encontrada');
    }

    const existing = await this.prisma.providerLocation.findUnique({
      where: {
        providerId_locationId: {
          providerId: dto.providerId,
          locationId: dto.locationId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Profissional já está associado a esta unidade');
    }

    if (dto.isPrimary) {
      await this.prisma.providerLocation.updateMany({
        where: { providerId: dto.providerId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const providerLocation = await this.prisma.providerLocation.create({
      data: {
        providerId: dto.providerId,
        locationId: dto.locationId,
        isPrimary: dto.isPrimary ?? false,
        scheduleOverride: dto.scheduleOverride,
      },
    });

    return {
      id: providerLocation.id,
      providerId: provider.id,
      providerName: provider.name,
      locationId: location.id,
      locationName: location.name,
      isPrimary: providerLocation.isPrimary,
      isActive: providerLocation.isActive,
    };
  }

  async updateProviderLocation(
    tenantId: string,
    providerLocationId: string,
    dto: UpdateProviderLocationDto,
  ): Promise<ProviderLocationResponseDto> {
    const providerLocation = await this.prisma.providerLocation.findFirst({
      where: {
        id: providerLocationId,
        location: { tenantId },
      },
      include: {
        provider: true,
        location: true,
      },
    });

    if (!providerLocation) {
      throw new NotFoundException('Associação não encontrada');
    }

    if (dto.isPrimary === true && !providerLocation.isPrimary) {
      await this.prisma.providerLocation.updateMany({
        where: {
          providerId: providerLocation.providerId,
          isPrimary: true,
          id: { not: providerLocationId },
        },
        data: { isPrimary: false },
      });
    }

    const updated = await this.prisma.providerLocation.update({
      where: { id: providerLocationId },
      data: dto,
    });

    return {
      id: updated.id,
      providerId: providerLocation.provider.id,
      providerName: providerLocation.provider.name,
      locationId: providerLocation.location.id,
      locationName: providerLocation.location.name,
      isPrimary: updated.isPrimary,
      isActive: updated.isActive,
    };
  }

  async removeProviderFromLocation(
    tenantId: string,
    providerLocationId: string,
  ): Promise<void> {
    const providerLocation = await this.prisma.providerLocation.findFirst({
      where: {
        id: providerLocationId,
        location: { tenantId },
      },
    });

    if (!providerLocation) {
      throw new NotFoundException('Associação não encontrada');
    }

    await this.prisma.providerLocation.update({
      where: { id: providerLocationId },
      data: { isActive: false },
    });
  }

  async getProviderLocations(
    tenantId: string,
    providerId: string,
  ): Promise<ProviderLocationResponseDto[]> {
    const providerLocations = await this.prisma.providerLocation.findMany({
      where: {
        providerId,
        location: { tenantId },
        isActive: true,
      },
      include: {
        provider: true,
        location: true,
      },
    });

    return providerLocations.map((pl) => ({
      id: pl.id,
      providerId: pl.provider.id,
      providerName: pl.provider.name,
      locationId: pl.location.id,
      locationName: pl.location.name,
      isPrimary: pl.isPrimary,
      isActive: pl.isActive,
    }));
  }

  async getLocationProviders(
    tenantId: string,
    locationId: string,
  ): Promise<ProviderLocationResponseDto[]> {
    const providerLocations = await this.prisma.providerLocation.findMany({
      where: {
        locationId,
        location: { tenantId },
        isActive: true,
      },
      include: {
        provider: true,
        location: true,
      },
    });

    return providerLocations.map((pl) => ({
      id: pl.id,
      providerId: pl.provider.id,
      providerName: pl.provider.name,
      locationId: pl.location.id,
      locationName: pl.location.name,
      isPrimary: pl.isPrimary,
      isActive: pl.isActive,
    }));
  }

  // ============================================================================
  // Location Inventory
  // ============================================================================

  async setLocationInventory(
    tenantId: string,
    locationId: string,
    dto: SetLocationInventoryDto,
  ): Promise<LocationInventoryResponseDto> {
    const [location, product] = await Promise.all([
      this.prisma.location.findFirst({ where: { id: locationId, tenantId } }),
      this.prisma.product.findFirst({ where: { id: dto.productId, tenantId } }),
    ]);

    if (!location) {
      throw new NotFoundException('Unidade não encontrada');
    }
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const inventory = await this.prisma.locationInventory.upsert({
      where: {
        locationId_productId: {
          locationId,
          productId: dto.productId,
        },
      },
      create: {
        locationId,
        productId: dto.productId,
        currentStock: dto.currentStock ?? 0,
        minStock: dto.minStock ?? 0,
        maxStock: dto.maxStock,
      },
      update: {
        currentStock: dto.currentStock,
        minStock: dto.minStock,
        maxStock: dto.maxStock,
        lastUpdatedAt: new Date(),
      },
    });

    return {
      locationId: location.id,
      locationName: location.name,
      productId: product.id,
      productName: product.name,
      sku: product.sku || undefined,
      currentStock: inventory.currentStock,
      minStock: inventory.minStock,
      maxStock: inventory.maxStock || undefined,
      isLowStock: inventory.currentStock <= inventory.minStock,
      isOutOfStock: inventory.currentStock === 0,
    };
  }

  async adjustLocationInventory(
    tenantId: string,
    locationId: string,
    dto: AdjustLocationInventoryDto,
  ): Promise<LocationInventoryResponseDto> {
    const [location, product] = await Promise.all([
      this.prisma.location.findFirst({ where: { id: locationId, tenantId } }),
      this.prisma.product.findFirst({ where: { id: dto.productId, tenantId } }),
    ]);

    if (!location) {
      throw new NotFoundException('Unidade não encontrada');
    }
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    const inventory = await this.prisma.locationInventory.findUnique({
      where: {
        locationId_productId: {
          locationId,
          productId: dto.productId,
        },
      },
    });

    if (!inventory) {
      throw new NotFoundException('Estoque não configurado para este produto nesta unidade');
    }

    const newStock = inventory.currentStock + dto.adjustment;
    if (newStock < 0) {
      throw new BadRequestException(
        `Estoque insuficiente. Atual: ${inventory.currentStock}, Ajuste: ${dto.adjustment}`,
      );
    }

    const updated = await this.prisma.locationInventory.update({
      where: { id: inventory.id },
      data: {
        currentStock: newStock,
        lastUpdatedAt: new Date(),
      },
    });

    // Registrar movimentação
    await this.prisma.stockMovement.create({
      data: {
        tenantId,
        productId: dto.productId,
        type: StockMovementType.ADJUSTMENT,
        quantity: dto.adjustment,
        description: dto.reason || `Ajuste manual - Unidade: ${location.name}`,
        previousStock: inventory.currentStock,
        currentStock: newStock,
      },
    });

    return {
      locationId: location.id,
      locationName: location.name,
      productId: product.id,
      productName: product.name,
      sku: product.sku || undefined,
      currentStock: updated.currentStock,
      minStock: updated.minStock,
      maxStock: updated.maxStock || undefined,
      isLowStock: updated.currentStock <= updated.minStock,
      isOutOfStock: updated.currentStock === 0,
    };
  }

  async getLocationInventory(
    tenantId: string,
    locationId: string,
    query: QueryLocationInventoryDto,
  ): Promise<LocationInventoryResponseDto[]> {
    const location = await this.prisma.location.findFirst({
      where: { id: locationId, tenantId },
    });

    if (!location) {
      throw new NotFoundException('Unidade não encontrada');
    }

    const inventories = await this.prisma.locationInventory.findMany({
      where: {
        locationId,
        ...(query.productId && { productId: query.productId }),
      },
      include: {
        product: true,
      },
    });

    let result = inventories.map((inv) => ({
      locationId: location.id,
      locationName: location.name,
      productId: inv.product.id,
      productName: inv.product.name,
      sku: inv.product.sku || undefined,
      currentStock: inv.currentStock,
      minStock: inv.minStock,
      maxStock: inv.maxStock || undefined,
      isLowStock: inv.currentStock <= inv.minStock,
      isOutOfStock: inv.currentStock === 0,
    }));

    if (query.lowStock) {
      result = result.filter((inv) => inv.isLowStock);
    }
    if (query.outOfStock) {
      result = result.filter((inv) => inv.isOutOfStock);
    }

    return result;
  }

  // ============================================================================
  // Location Transfers
  // ============================================================================

  async createTransfer(
    tenantId: string,
    requestedById: string,
    dto: CreateTransferDto,
  ): Promise<TransferResponseDto> {
    const [fromLocation, toLocation, product] = await Promise.all([
      this.prisma.location.findFirst({ where: { id: dto.fromLocationId, tenantId } }),
      this.prisma.location.findFirst({ where: { id: dto.toLocationId, tenantId } }),
      this.prisma.product.findFirst({ where: { id: dto.productId, tenantId } }),
    ]);

    if (!fromLocation) {
      throw new NotFoundException('Unidade de origem não encontrada');
    }
    if (!toLocation) {
      throw new NotFoundException('Unidade de destino não encontrada');
    }
    if (!product) {
      throw new NotFoundException('Produto não encontrado');
    }

    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException('Origem e destino devem ser diferentes');
    }

    const fromInventory = await this.prisma.locationInventory.findUnique({
      where: {
        locationId_productId: {
          locationId: dto.fromLocationId,
          productId: dto.productId,
        },
      },
    });

    if (!fromInventory || fromInventory.currentStock < dto.quantity) {
      throw new BadRequestException(
        `Estoque insuficiente na origem. Disponível: ${fromInventory?.currentStock ?? 0}`,
      );
    }

    const transfer = await this.prisma.locationTransfer.create({
      data: {
        tenantId,
        fromLocationId: dto.fromLocationId,
        toLocationId: dto.toLocationId,
        productId: dto.productId,
        quantity: dto.quantity,
        unitCost: dto.unitCost,
        status: TransferStatus.PENDING,
        requestedBy: requestedById,
        notes: dto.notes,
      },
    });

    return this.mapTransferToResponse(transfer, fromLocation, toLocation, product);
  }

  async updateTransferStatus(
    tenantId: string,
    transferId: string,
    userId: string,
    dto: UpdateTransferStatusDto,
  ): Promise<TransferResponseDto> {
    const transfer = await this.prisma.locationTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: {
        fromLocation: true,
        toLocation: true,
        product: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException('Transferência não encontrada');
    }

    this.validateStatusTransition(transfer.status, dto.status);

    const updateData: any = {
      status: dto.status,
      notes: dto.notes ?? transfer.notes,
    };

    if (dto.status === TransferStatus.APPROVED) {
      updateData.approvedBy = userId;
      updateData.approvedAt = new Date();
    }

    if (dto.status === TransferStatus.COMPLETED) {
      updateData.completedAt = new Date();

      // Atualizar estoques
      const fromInventory = await this.prisma.locationInventory.findUnique({
        where: {
          locationId_productId: {
            locationId: transfer.fromLocationId,
            productId: transfer.productId,
          },
        },
      });

      await this.prisma.$transaction([
        this.prisma.locationInventory.update({
          where: {
            locationId_productId: {
              locationId: transfer.fromLocationId,
              productId: transfer.productId,
            },
          },
          data: {
            currentStock: { decrement: transfer.quantity },
            lastUpdatedAt: new Date(),
          },
        }),
        this.prisma.locationInventory.upsert({
          where: {
            locationId_productId: {
              locationId: transfer.toLocationId,
              productId: transfer.productId,
            },
          },
          create: {
            locationId: transfer.toLocationId,
            productId: transfer.productId,
            currentStock: transfer.quantity,
            minStock: 0,
          },
          update: {
            currentStock: { increment: transfer.quantity },
            lastUpdatedAt: new Date(),
          },
        }),
        this.prisma.stockMovement.create({
          data: {
            tenantId,
            productId: transfer.productId,
            type: StockMovementType.TRANSFER,
            quantity: -transfer.quantity,
            description: `Transferência para ${transfer.toLocation.name}`,
            previousStock: fromInventory?.currentStock ?? 0,
            currentStock: (fromInventory?.currentStock ?? 0) - transfer.quantity,
          },
        }),
      ]);
    }

    if (dto.status === TransferStatus.CANCELLED) {
      updateData.cancelledAt = new Date();
    }

    const updated = await this.prisma.locationTransfer.update({
      where: { id: transferId },
      data: updateData,
    });

    return this.mapTransferToResponse(
      updated,
      transfer.fromLocation,
      transfer.toLocation,
      transfer.product,
    );
  }

  async listTransfers(
    tenantId: string,
    query: QueryTransfersDto,
  ): Promise<{ transfers: TransferResponseDto[]; total: number }> {
    const where: Prisma.LocationTransferWhereInput = {
      tenantId,
      ...(query.fromLocationId && { fromLocationId: query.fromLocationId }),
      ...(query.toLocationId && { toLocationId: query.toLocationId }),
      ...(query.productId && { productId: query.productId }),
      ...(query.status && { status: query.status }),
    };

    const [transfers, total] = await Promise.all([
      this.prisma.locationTransfer.findMany({
        where,
        include: {
          fromLocation: true,
          toLocation: true,
          product: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
      }),
      this.prisma.locationTransfer.count({ where }),
    ]);

    return {
      transfers: transfers.map((t) =>
        this.mapTransferToResponse(t, t.fromLocation, t.toLocation, t.product),
      ),
      total,
    };
  }

  // ============================================================================
  // Consolidated Reports (Simplified)
  // ============================================================================

  async getConsolidatedDashboard(
    tenantId: string,
    query: ConsolidatedReportQueryDto,
  ) {
    const locations = await this.prisma.location.findMany({
      where: { tenantId, isActive: true },
    });

    return {
      totalLocations: locations.length,
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        isHeadquarters: l.isHeadquarters,
      })),
    };
  }

  async getConsolidatedFinancialReport(
    tenantId: string,
    query: ConsolidatedReportQueryDto,
  ) {
    return {
      message: 'Relatório financeiro consolidado - Em implementação',
      tenantId,
    };
  }

  async getConsolidatedInventoryReport(
    tenantId: string,
    query: ConsolidatedReportQueryDto,
  ) {
    const inventories = await this.prisma.locationInventory.findMany({
      where: {
        location: { tenantId },
      },
      include: {
        location: true,
        product: true,
      },
    });

    return {
      totalItems: inventories.length,
      lowStock: inventories.filter((i) => i.currentStock <= i.minStock).length,
      outOfStock: inventories.filter((i) => i.currentStock === 0).length,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async generateLocationCode(tenantId: string): Promise<string> {
    const count = await this.prisma.location.count({ where: { tenantId } });
    return `LOC${String(count + 1).padStart(3, '0')}`;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private validateStatusTransition(
    currentStatus: TransferStatus,
    newStatus: TransferStatus,
  ): void {
    const validTransitions: Record<TransferStatus, TransferStatus[]> = {
      PENDING: [TransferStatus.APPROVED, TransferStatus.CANCELLED],
      APPROVED: [TransferStatus.IN_TRANSIT, TransferStatus.CANCELLED],
      IN_TRANSIT: [TransferStatus.COMPLETED, TransferStatus.CANCELLED],
      COMPLETED: [],
      CANCELLED: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      throw new BadRequestException(
        `Transição de status inválida: ${currentStatus} -> ${newStatus}`,
      );
    }
  }

  private mapToResponse(
    location: any,
    providersCount: number,
    appointmentsToday: number,
  ): LocationResponseDto {
    return {
      id: location.id,
      name: location.name,
      code: location.code,
      slug: location.slug,
      address: location.address,
      city: location.city,
      state: location.state,
      phone: location.phone,
      isHeadquarters: location.isHeadquarters,
      isActive: location.isActive,
      providersCount,
      appointmentsToday,
    };
  }

  private mapToDetailResponse(
    location: any,
    providers?: any[],
  ): LocationDetailResponseDto {
    return {
      id: location.id,
      name: location.name,
      code: location.code,
      slug: location.slug,
      address: location.address,
      addressNumber: location.addressNumber,
      complement: location.complement,
      neighborhood: location.neighborhood,
      city: location.city,
      state: location.state,
      zipCode: location.zipCode,
      country: location.country,
      latitude: location.latitude?.toNumber?.() ?? location.latitude,
      longitude: location.longitude?.toNumber?.() ?? location.longitude,
      phone: location.phone,
      whatsapp: location.whatsapp,
      email: location.email,
      businessHours: location.businessHours,
      timezone: location.timezone,
      isHeadquarters: location.isHeadquarters,
      isActive: location.isActive,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
      providers: providers?.map((pl) => ({
        id: pl.id,
        providerId: pl.provider?.id ?? pl.providerId,
        providerName: pl.provider?.name ?? '',
        locationId: location.id,
        locationName: location.name,
        isPrimary: pl.isPrimary,
        isActive: pl.isActive,
      })),
    };
  }

  private mapTransferToResponse(
    transfer: any,
    fromLocation: any,
    toLocation: any,
    product: any,
  ): TransferResponseDto {
    return {
      id: transfer.id,
      fromLocation: { id: fromLocation.id, name: fromLocation.name },
      toLocation: { id: toLocation.id, name: toLocation.name },
      product: { id: product.id, name: product.name, sku: product.sku },
      quantity: transfer.quantity,
      unitCost: transfer.unitCost?.toNumber?.() ?? transfer.unitCost,
      status: transfer.status,
      requestedAt: transfer.requestedAt ?? transfer.createdAt,
      approvedAt: transfer.approvedAt,
      completedAt: transfer.completedAt,
      notes: transfer.notes,
    };
  }
}
