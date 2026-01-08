import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ClientPackageStatus,
  PackageUsageStatus,
  ValidityType,
  Prisma,
} from '@prisma/client';
import {
  CreatePackageTemplateDto,
  UpdatePackageTemplateDto,
  QueryPackageTemplatesDto,
  SellPackageDto,
  UpdateClientPackageDto,
  RegisterPaymentDto,
  QueryClientPackagesDto,
  RegisterUsageDto,
  CancelUsageDto,
  QueryUsagesDto,
  TransferPackageDto,
  PackageTemplateResponseDto,
  ClientPackageResponseDto,
  ClientPackageUsageResponseDto,
  PackagesSummaryDto,
  ClientPackageBalanceDto,
} from './dto/client-packages.dto';

@Injectable()
export class ClientPackagesService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // Package Templates
  // ============================================================================

  async createTemplate(
    tenantId: string,
    dto: CreatePackageTemplateDto,
  ): Promise<PackageTemplateResponseDto> {
    // Validar que todos os serviços existem
    const serviceIds = dto.items.map((item) => item.serviceId);
    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds }, tenantId, deletedAt: null },
    });

    if (services.length !== serviceIds.length) {
      throw new BadRequestException('Um ou mais serviços não foram encontrados');
    }

    // Calcular preço original se não fornecido
    let originalPrice = dto.originalPrice;
    if (!originalPrice) {
      originalPrice = dto.items.reduce((sum, item) => {
        const service = services.find((s) => s.id === item.serviceId);
        const price = item.unitPrice ?? service!.price.toNumber();
        return sum + price * item.quantity;
      }, 0);
    }

    const template = await this.prisma.packageTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        code: dto.code,
        validityDays: dto.validityDays,
        validityType: dto.validityType || ValidityType.DAYS_FROM_PURCHASE,
        originalPrice,
        salePrice: dto.salePrice,
        allowPartialUse: dto.allowPartialUse ?? true,
        transferable: dto.transferable ?? false,
        maxInstallments: dto.maxInstallments ?? 1,
        items: {
          create: dto.items.map((item) => ({
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: {
        items: {
          include: {
            service: true,
          },
        },
      },
    });

    return this.mapTemplateToResponse(template);
  }

  async updateTemplate(
    tenantId: string,
    templateId: string,
    dto: UpdatePackageTemplateDto,
  ): Promise<PackageTemplateResponseDto> {
    const template = await this.prisma.packageTemplate.findFirst({
      where: { id: templateId, tenantId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundException('Template de pacote não encontrado');
    }

    // Se estiver atualizando itens, validar serviços
    if (dto.items) {
      const serviceIds = dto.items.map((item) => item.serviceId);
      const services = await this.prisma.service.findMany({
        where: { id: { in: serviceIds }, tenantId, deletedAt: null },
      });

      if (services.length !== serviceIds.length) {
        throw new BadRequestException('Um ou mais serviços não foram encontrados');
      }

      // Deletar itens antigos e criar novos
      await this.prisma.packageTemplateItem.deleteMany({
        where: { packageTemplateId: templateId },
      });

      await this.prisma.packageTemplateItem.createMany({
        data: dto.items.map((item) => ({
          packageTemplateId: templateId,
          serviceId: item.serviceId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });
    }

    const updated = await this.prisma.packageTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name,
        description: dto.description,
        code: dto.code,
        validityDays: dto.validityDays,
        validityType: dto.validityType,
        originalPrice: dto.originalPrice,
        salePrice: dto.salePrice,
        isActive: dto.isActive,
        allowPartialUse: dto.allowPartialUse,
        transferable: dto.transferable,
        maxInstallments: dto.maxInstallments,
      },
      include: {
        items: {
          include: {
            service: true,
          },
        },
      },
    });

    return this.mapTemplateToResponse(updated);
  }

  async getTemplate(
    tenantId: string,
    templateId: string,
  ): Promise<PackageTemplateResponseDto> {
    const template = await this.prisma.packageTemplate.findFirst({
      where: { id: templateId, tenantId, deletedAt: null },
      include: {
        items: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template de pacote não encontrado');
    }

    return this.mapTemplateToResponse(template);
  }

  async listTemplates(
    tenantId: string,
    query: QueryPackageTemplatesDto,
  ): Promise<PackageTemplateResponseDto[]> {
    const where: Prisma.PackageTemplateWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { description: { contains: query.search, mode: 'insensitive' as const } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
      ...(query.serviceId && {
        items: { some: { serviceId: query.serviceId } },
      }),
    };

    const templates = await this.prisma.packageTemplate.findMany({
      where,
      include: {
        items: {
          include: {
            service: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return templates.map((t) => this.mapTemplateToResponse(t));
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    const template = await this.prisma.packageTemplate.findFirst({
      where: { id: templateId, tenantId, deletedAt: null },
    });

    if (!template) {
      throw new NotFoundException('Template de pacote não encontrado');
    }

    // Soft delete
    await this.prisma.packageTemplate.update({
      where: { id: templateId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ============================================================================
  // Selling Packages
  // ============================================================================

  async sellPackage(
    tenantId: string,
    userId: string,
    dto: SellPackageDto,
  ): Promise<ClientPackageResponseDto> {
    // Validar cliente
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    let name = dto.name;
    let description = dto.description;
    let originalPrice = 0;
    let salePrice = dto.salePrice ?? 0;
    let items: { serviceId: string; quantity: number; unitPrice: number }[] = [];
    let validityDays = 365;
    let validityType: ValidityType = ValidityType.DAYS_FROM_PURCHASE;

    // Se tem template, usar dados do template
    if (dto.packageTemplateId) {
      const template = await this.prisma.packageTemplate.findFirst({
        where: { id: dto.packageTemplateId, tenantId, isActive: true, deletedAt: null },
        include: {
          items: {
            include: {
              service: true,
            },
          },
        },
      });

      if (!template) {
        throw new NotFoundException('Template de pacote não encontrado ou inativo');
      }

      name = name || template.name;
      description = description || template.description || undefined;
      originalPrice = template.originalPrice.toNumber();
      salePrice = dto.salePrice ?? template.salePrice.toNumber();
      validityDays = template.validityDays;
      validityType = template.validityType;

      items = template.items.map((item) => ({
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPrice: item.unitPrice?.toNumber() ?? item.service.price.toNumber(),
      }));
    } else {
      // Pacote customizado
      if (!dto.items || dto.items.length === 0) {
        throw new BadRequestException(
          'Para pacotes customizados, os itens são obrigatórios',
        );
      }

      if (!name) {
        throw new BadRequestException(
          'Para pacotes customizados, o nome é obrigatório',
        );
      }

      // Validar serviços
      const serviceIds = dto.items.map((item) => item.serviceId);
      const services = await this.prisma.service.findMany({
        where: { id: { in: serviceIds }, tenantId, deletedAt: null },
      });

      if (services.length !== serviceIds.length) {
        throw new BadRequestException('Um ou mais serviços não foram encontrados');
      }

      originalPrice = dto.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      salePrice = dto.salePrice ?? originalPrice;
      items = dto.items;
    }

    // Gerar código único
    const code = await this.generatePackageCode(tenantId);

    // Calcular datas
    const purchaseDate = new Date();
    let activationDate = dto.activationDate
      ? new Date(dto.activationDate)
      : null;
    let expiresAt: Date | null = null;

    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
    } else if (validityType === ValidityType.DAYS_FROM_PURCHASE) {
      expiresAt = new Date(purchaseDate);
      expiresAt.setDate(expiresAt.getDate() + validityDays);
    } else if (
      validityType === ValidityType.DAYS_FROM_ACTIVATION &&
      activationDate
    ) {
      expiresAt = new Date(activationDate);
      expiresAt.setDate(expiresAt.getDate() + validityDays);
    }

    // Determinar status inicial
    const paidAmount = dto.paidAmount ?? 0;
    const status =
      paidAmount >= salePrice - (dto.discountAmount ?? 0)
        ? ClientPackageStatus.ACTIVE
        : ClientPackageStatus.PENDING_PAYMENT;

    // Criar pacote
    const clientPackage = await this.prisma.clientPackage.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        packageTemplateId: dto.packageTemplateId,
        name,
        description,
        code,
        purchaseDate,
        activationDate,
        expiresAt,
        status,
        originalPrice,
        salePrice,
        discountAmount: dto.discountAmount ?? 0,
        paidAmount,
        paymentMethod: dto.paymentMethod,
        installments: dto.installments ?? 1,
        notes: dto.notes,
        internalNotes: dto.internalNotes,
        soldById: userId,
        items: {
          create: items.map((item) => ({
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
      include: {
        client: true,
        items: {
          include: {
            service: true,
          },
        },
      },
    });

    // Criar transação financeira se houver pagamento
    if (paidAmount > 0) {
      await this.createPaymentTransaction(
        tenantId,
        clientPackage.id,
        dto.clientId,
        paidAmount,
        dto.paymentMethod,
        userId,
      );
    }

    return this.mapClientPackageToResponse(clientPackage);
  }

  async updateClientPackage(
    tenantId: string,
    packageId: string,
    dto: UpdateClientPackageDto,
  ): Promise<ClientPackageResponseDto> {
    const clientPackage = await this.prisma.clientPackage.findFirst({
      where: { id: packageId, tenantId },
    });

    if (!clientPackage) {
      throw new NotFoundException('Pacote não encontrado');
    }

    const updated = await this.prisma.clientPackage.update({
      where: { id: packageId },
      data: {
        notes: dto.notes,
        internalNotes: dto.internalNotes,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        status: dto.status,
      },
      include: {
        client: true,
        items: {
          include: {
            service: true,
            usages: true,
          },
        },
      },
    });

    return this.mapClientPackageToResponse(updated);
  }

  async getClientPackage(
    tenantId: string,
    packageId: string,
  ): Promise<ClientPackageResponseDto> {
    const clientPackage = await this.prisma.clientPackage.findFirst({
      where: { id: packageId, tenantId },
      include: {
        client: true,
        items: {
          include: {
            service: true,
            usages: true,
          },
        },
      },
    });

    if (!clientPackage) {
      throw new NotFoundException('Pacote não encontrado');
    }

    return this.mapClientPackageToResponse(clientPackage);
  }

  async listClientPackages(
    tenantId: string,
    query: QueryClientPackagesDto,
  ): Promise<{ packages: ClientPackageResponseDto[]; total: number }> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const where: Prisma.ClientPackageWhereInput = {
      tenantId,
      ...(query.clientId && { clientId: query.clientId }),
      ...(query.status && { status: query.status }),
      ...(query.expiringSoon && {
        expiresAt: { gte: now, lte: thirtyDaysFromNow },
        status: ClientPackageStatus.ACTIVE,
      }),
      ...(query.purchaseDateStart || query.purchaseDateEnd
        ? {
            purchaseDate: {
              ...(query.purchaseDateStart && {
                gte: new Date(query.purchaseDateStart),
              }),
              ...(query.purchaseDateEnd && {
                lte: new Date(query.purchaseDateEnd),
              }),
            },
          }
        : {}),
    };

    const [packages, total] = await Promise.all([
      this.prisma.clientPackage.findMany({
        where,
        include: {
          client: true,
          items: {
            include: {
              service: true,
              usages: true,
            },
          },
        },
        orderBy: { purchaseDate: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
      }),
      this.prisma.clientPackage.count({ where }),
    ]);

    // Filtro adicional para hasBalance (precisa calcular após buscar)
    let result = packages.map((p) => this.mapClientPackageToResponse(p));

    if (query.hasBalance) {
      result = result.filter((p) => p.usageStats.availableItems > 0);
    }

    return { packages: result, total };
  }

  async cancelClientPackage(
    tenantId: string,
    packageId: string,
    reason?: string,
  ): Promise<ClientPackageResponseDto> {
    const clientPackage = await this.prisma.clientPackage.findFirst({
      where: { id: packageId, tenantId },
    });

    if (!clientPackage) {
      throw new NotFoundException('Pacote não encontrado');
    }

    if (clientPackage.status === ClientPackageStatus.CANCELLED) {
      throw new BadRequestException('Pacote já está cancelado');
    }

    const updated = await this.prisma.clientPackage.update({
      where: { id: packageId },
      data: {
        status: ClientPackageStatus.CANCELLED,
        cancelledAt: new Date(),
        internalNotes: reason
          ? `${clientPackage.internalNotes || ''}\n\nMotivo do cancelamento: ${reason}`
          : clientPackage.internalNotes,
      },
      include: {
        client: true,
        items: {
          include: {
            service: true,
            usages: true,
          },
        },
      },
    });

    return this.mapClientPackageToResponse(updated);
  }

  // ============================================================================
  // Payment Management
  // ============================================================================

  async registerPayment(
    tenantId: string,
    packageId: string,
    userId: string,
    dto: RegisterPaymentDto,
  ): Promise<ClientPackageResponseDto> {
    const clientPackage = await this.prisma.clientPackage.findFirst({
      where: { id: packageId, tenantId },
    });

    if (!clientPackage) {
      throw new NotFoundException('Pacote não encontrado');
    }

    const newPaidAmount = clientPackage.paidAmount.toNumber() + dto.amount;
    const totalDue =
      clientPackage.salePrice.toNumber() -
      clientPackage.discountAmount.toNumber();

    // Atualizar pacote
    const newStatus =
      newPaidAmount >= totalDue
        ? ClientPackageStatus.ACTIVE
        : clientPackage.status;

    const updated = await this.prisma.clientPackage.update({
      where: { id: packageId },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus,
        paymentMethod: dto.paymentMethod || clientPackage.paymentMethod,
        paymentNotes: dto.notes
          ? `${clientPackage.paymentNotes || ''}\n${dto.notes}`
          : clientPackage.paymentNotes,
      },
      include: {
        client: true,
        items: {
          include: {
            service: true,
            usages: true,
          },
        },
      },
    });

    // Criar transação financeira
    await this.createPaymentTransaction(
      tenantId,
      packageId,
      clientPackage.clientId,
      dto.amount,
      dto.paymentMethod,
      userId,
    );

    return this.mapClientPackageToResponse(updated);
  }

  // ============================================================================
  // Usage Management
  // ============================================================================

  async registerUsage(
    tenantId: string,
    userId: string,
    dto: RegisterUsageDto,
  ): Promise<ClientPackageUsageResponseDto> {
    const clientPackage = await this.prisma.clientPackage.findFirst({
      where: { id: dto.clientPackageId, tenantId },
      include: {
        client: true,
        items: {
          include: {
            service: true,
            usages: {
              where: { status: PackageUsageStatus.USED },
            },
          },
        },
      },
    });

    if (!clientPackage) {
      throw new NotFoundException('Pacote não encontrado');
    }

    // Validar status do pacote
    if (clientPackage.status !== ClientPackageStatus.ACTIVE) {
      throw new BadRequestException(
        `Pacote não está ativo. Status atual: ${clientPackage.status}`,
      );
    }

    // Validar validade
    if (clientPackage.expiresAt && clientPackage.expiresAt < new Date()) {
      // Atualizar status para expirado
      await this.prisma.clientPackage.update({
        where: { id: dto.clientPackageId },
        data: { status: ClientPackageStatus.EXPIRED },
      });
      throw new BadRequestException('Pacote expirado');
    }

    // Encontrar o item do pacote para o serviço
    const packageItem = clientPackage.items.find(
      (item) => item.serviceId === dto.serviceId,
    );

    if (!packageItem) {
      throw new BadRequestException('Serviço não incluído neste pacote');
    }

    // Verificar disponibilidade
    const usedQuantity = packageItem.usages.reduce(
      (sum, u) => sum + u.quantity,
      0,
    );
    const availableQuantity =
      packageItem.quantity - usedQuantity - packageItem.cancelledQuantity;
    const requestedQuantity = dto.quantity ?? 1;

    if (availableQuantity < requestedQuantity) {
      throw new BadRequestException(
        `Quantidade insuficiente. Disponível: ${availableQuantity}`,
      );
    }

    // Registrar uso
    const usage = await this.prisma.clientPackageUsage.create({
      data: {
        clientPackageId: dto.clientPackageId,
        clientPackageItemId: packageItem.id,
        appointmentId: dto.appointmentId,
        quantity: requestedQuantity,
        usedById: userId,
        providerId: dto.providerId,
        notes: dto.notes,
      },
      include: {
        clientPackage: {
          include: {
            client: true,
          },
        },
        clientPackageItem: {
          include: {
            service: true,
          },
        },
      },
    });

    // Atualizar quantidade usada no item
    await this.prisma.clientPackageItem.update({
      where: { id: packageItem.id },
      data: {
        usedQuantity: { increment: requestedQuantity },
      },
    });

    // Verificar se pacote foi completamente usado
    await this.checkPackageCompletion(dto.clientPackageId);

    // Ativar pacote se primeira utilização (validityType = DAYS_FROM_ACTIVATION)
    if (!clientPackage.activationDate) {
      const template = clientPackage.packageTemplateId
        ? await this.prisma.packageTemplate.findUnique({
            where: { id: clientPackage.packageTemplateId },
          })
        : null;

      if (template?.validityType === ValidityType.DAYS_FROM_ACTIVATION) {
        const activationDate = new Date();
        const expiresAt = new Date(activationDate);
        expiresAt.setDate(expiresAt.getDate() + template.validityDays);

        await this.prisma.clientPackage.update({
          where: { id: dto.clientPackageId },
          data: { activationDate, expiresAt },
        });
      }
    }

    return this.mapUsageToResponse(usage);
  }

  async cancelUsage(
    tenantId: string,
    usageId: string,
    userId: string,
    dto: CancelUsageDto,
  ): Promise<ClientPackageUsageResponseDto> {
    const usage = await this.prisma.clientPackageUsage.findFirst({
      where: {
        id: usageId,
        clientPackage: { tenantId },
      },
      include: {
        clientPackage: {
          include: {
            client: true,
          },
        },
        clientPackageItem: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!usage) {
      throw new NotFoundException('Uso não encontrado');
    }

    if (usage.status === PackageUsageStatus.CANCELLED) {
      throw new BadRequestException('Uso já está cancelado');
    }

    // Cancelar uso
    const updated = await this.prisma.clientPackageUsage.update({
      where: { id: usageId },
      data: {
        status: PackageUsageStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: userId,
        cancellationReason: dto.reason,
      },
      include: {
        clientPackage: {
          include: {
            client: true,
          },
        },
        clientPackageItem: {
          include: {
            service: true,
          },
        },
      },
    });

    // Devolver quantidade ao item
    await this.prisma.clientPackageItem.update({
      where: { id: usage.clientPackageItemId },
      data: {
        usedQuantity: { decrement: usage.quantity },
      },
    });

    // Se pacote estava completo, reativar
    if (usage.clientPackage.status === ClientPackageStatus.COMPLETED) {
      await this.prisma.clientPackage.update({
        where: { id: usage.clientPackageId },
        data: { status: ClientPackageStatus.ACTIVE, completedAt: null },
      });
    }

    return this.mapUsageToResponse(updated);
  }

  async listUsages(
    tenantId: string,
    query: QueryUsagesDto,
  ): Promise<{ usages: ClientPackageUsageResponseDto[]; total: number }> {
    const where: Prisma.ClientPackageUsageWhereInput = {
      clientPackage: {
        tenantId,
        ...(query.clientId && { clientId: query.clientId }),
      },
      ...(query.clientPackageId && { clientPackageId: query.clientPackageId }),
      ...(query.serviceId && {
        clientPackageItem: { serviceId: query.serviceId },
      }),
      ...(query.status && { status: query.status }),
      ...(query.startDate || query.endDate
        ? {
            usedAt: {
              ...(query.startDate && { gte: new Date(query.startDate) }),
              ...(query.endDate && { lte: new Date(query.endDate) }),
            },
          }
        : {}),
    };

    const [usages, total] = await Promise.all([
      this.prisma.clientPackageUsage.findMany({
        where,
        include: {
          clientPackage: {
            include: {
              client: true,
            },
          },
          clientPackageItem: {
            include: {
              service: true,
            },
          },
        },
        orderBy: { usedAt: 'desc' },
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
      }),
      this.prisma.clientPackageUsage.count({ where }),
    ]);

    return {
      usages: usages.map((u) => this.mapUsageToResponse(u)),
      total,
    };
  }

  // ============================================================================
  // Package Transfer
  // ============================================================================

  async transferPackage(
    tenantId: string,
    packageId: string,
    userId: string,
    dto: TransferPackageDto,
  ): Promise<ClientPackageResponseDto> {
    const clientPackage = await this.prisma.clientPackage.findFirst({
      where: { id: packageId, tenantId },
      include: {
        packageTemplate: true,
      },
    });

    if (!clientPackage) {
      throw new NotFoundException('Pacote não encontrado');
    }

    // Verificar se é transferível
    const isTransferable =
      clientPackage.packageTemplate?.transferable ?? false;

    if (!isTransferable) {
      throw new BadRequestException('Este pacote não é transferível');
    }

    // Validar novo cliente
    const newClient = await this.prisma.client.findFirst({
      where: { id: dto.toClientId, tenantId, deletedAt: null },
    });

    if (!newClient) {
      throw new NotFoundException('Cliente de destino não encontrado');
    }

    if (clientPackage.clientId === dto.toClientId) {
      throw new BadRequestException(
        'Cliente de destino é o mesmo do pacote atual',
      );
    }

    // Transferir pacote
    const updated = await this.prisma.clientPackage.update({
      where: { id: packageId },
      data: {
        clientId: dto.toClientId,
        internalNotes: `${clientPackage.internalNotes || ''}\n\nTransferido de cliente ${clientPackage.clientId} para ${dto.toClientId} em ${new Date().toISOString()}. ${dto.notes || ''}`,
      },
      include: {
        client: true,
        items: {
          include: {
            service: true,
            usages: true,
          },
        },
      },
    });

    return this.mapClientPackageToResponse(updated);
  }

  // ============================================================================
  // Reports
  // ============================================================================

  async getClientBalance(
    tenantId: string,
    clientId: string,
  ): Promise<ClientPackageBalanceDto> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const packages = await this.prisma.clientPackage.findMany({
      where: {
        clientId,
        tenantId,
        status: ClientPackageStatus.ACTIVE,
      },
      include: {
        items: {
          include: {
            service: true,
            usages: {
              where: { status: PackageUsageStatus.USED },
            },
          },
        },
      },
    });

    const availableServices: {
      serviceId: string;
      serviceName: string;
      available: number;
      expiresAt?: Date;
    }[] = [];

    let totalPurchased = 0;
    let totalPaid = 0;

    packages.forEach((pkg) => {
      totalPurchased += pkg.salePrice.toNumber() - pkg.discountAmount.toNumber();
      totalPaid += pkg.paidAmount.toNumber();

      pkg.items.forEach((item) => {
        const usedQuantity = item.usages.reduce((sum, u) => sum + u.quantity, 0);
        const available = item.quantity - usedQuantity - item.cancelledQuantity;

        if (available > 0) {
          const existing = availableServices.find(
            (s) => s.serviceId === item.serviceId,
          );

          if (existing) {
            existing.available += available;
            // Manter a data de expiração mais próxima
            if (
              pkg.expiresAt &&
              (!existing.expiresAt || pkg.expiresAt < existing.expiresAt)
            ) {
              existing.expiresAt = pkg.expiresAt;
            }
          } else {
            availableServices.push({
              serviceId: item.serviceId,
              serviceName: item.service.name,
              available,
              expiresAt: pkg.expiresAt || undefined,
            });
          }
        }
      });
    });

    return {
      clientId,
      clientName: client.name,
      activePackages: packages.length,
      totalPurchased,
      totalPaid,
      totalPending: totalPurchased - totalPaid,
      availableServices,
    };
  }

  async getPackagesSummary(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<PackagesSummaryDto> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Vendas no período
    const salesInPeriod = await this.prisma.clientPackage.findMany({
      where: {
        tenantId,
        purchaseDate: { gte: startDate, lte: endDate },
      },
      include: {
        packageTemplate: true,
      },
    });

    const salesTotal = salesInPeriod.reduce(
      (sum, p) => sum + p.salePrice.toNumber() - p.discountAmount.toNumber(),
      0,
    );

    // Usos no período
    const usagesInPeriod = await this.prisma.clientPackageUsage.findMany({
      where: {
        clientPackage: { tenantId },
        usedAt: { gte: startDate, lte: endDate },
        status: PackageUsageStatus.USED,
      },
      include: {
        clientPackageItem: true,
      },
    });

    const usagesValue = usagesInPeriod.reduce(
      (sum, u) => sum + u.clientPackageItem.unitPrice.toNumber() * u.quantity,
      0,
    );

    // Pacotes expirando
    const expiringPackages = await this.prisma.clientPackage.findMany({
      where: {
        tenantId,
        status: ClientPackageStatus.ACTIVE,
        expiresAt: { gte: now, lte: thirtyDaysFromNow },
      },
      include: {
        items: {
          include: {
            usages: {
              where: { status: PackageUsageStatus.USED },
            },
          },
        },
      },
    });

    let expiringValue = 0;
    expiringPackages.forEach((pkg) => {
      pkg.items.forEach((item) => {
        const usedQuantity = item.usages.reduce((sum, u) => sum + u.quantity, 0);
        const available = item.quantity - usedQuantity - item.cancelledQuantity;
        expiringValue += available * item.unitPrice.toNumber();
      });
    });

    // Pacotes ativos
    const activePackages = await this.prisma.clientPackage.findMany({
      where: {
        tenantId,
        status: ClientPackageStatus.ACTIVE,
      },
      include: {
        items: {
          include: {
            usages: {
              where: { status: PackageUsageStatus.USED },
            },
          },
        },
      },
    });

    let activeTotalValue = 0;
    let activeAvailableValue = 0;

    activePackages.forEach((pkg) => {
      pkg.items.forEach((item) => {
        const itemTotal = item.quantity * item.unitPrice.toNumber();
        const usedQuantity = item.usages.reduce((sum, u) => sum + u.quantity, 0);
        const available = item.quantity - usedQuantity - item.cancelledQuantity;
        const availableValue = available * item.unitPrice.toNumber();

        activeTotalValue += itemTotal;
        activeAvailableValue += availableValue;
      });
    });

    // Top pacotes vendidos
    const templateCounts: Record<
      string,
      { name: string; count: number; revenue: number }
    > = {};

    salesInPeriod.forEach((pkg) => {
      const templateId = pkg.packageTemplateId || 'custom';
      const templateName = pkg.packageTemplate?.name || pkg.name;

      if (!templateCounts[templateId]) {
        templateCounts[templateId] = { name: templateName, count: 0, revenue: 0 };
      }
      templateCounts[templateId].count++;
      templateCounts[templateId].revenue +=
        pkg.salePrice.toNumber() - pkg.discountAmount.toNumber();
    });

    const topPackages = Object.entries(templateCounts)
      .map(([templateId, data]) => ({
        templateId,
        templateName: data.name,
        count: data.count,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Top serviços utilizados
    const serviceCounts: Record<string, { name: string; usages: number }> = {};

    for (const usage of usagesInPeriod) {
      const serviceId = usage.clientPackageItem.serviceId;
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
      });

      if (!serviceCounts[serviceId]) {
        serviceCounts[serviceId] = { name: service?.name || '', usages: 0 };
      }
      serviceCounts[serviceId].usages += usage.quantity;
    }

    const topServices = Object.entries(serviceCounts)
      .map(([serviceId, data]) => ({
        serviceId,
        serviceName: data.name,
        usages: data.usages,
      }))
      .sort((a, b) => b.usages - a.usages)
      .slice(0, 5);

    return {
      period: { start: startDate, end: endDate },
      sales: {
        count: salesInPeriod.length,
        totalValue: salesTotal,
        averageValue: salesInPeriod.length > 0 ? salesTotal / salesInPeriod.length : 0,
      },
      usages: {
        count: usagesInPeriod.length,
        totalValue: usagesValue,
      },
      expiringPackages: {
        count: expiringPackages.length,
        value: expiringValue,
      },
      activePackages: {
        count: activePackages.length,
        totalValue: activeTotalValue,
        availableValue: activeAvailableValue,
      },
      topPackages,
      topServices,
    };
  }

  // ============================================================================
  // Scheduled Jobs
  // ============================================================================

  async expirePackages(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.clientPackage.updateMany({
      where: {
        status: ClientPackageStatus.ACTIVE,
        expiresAt: { lt: now },
      },
      data: {
        status: ClientPackageStatus.EXPIRED,
      },
    });

    return result.count;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async generatePackageCode(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.clientPackage.count({
      where: {
        tenantId,
        purchaseDate: {
          gte: new Date(year, 0, 1),
          lt: new Date(year + 1, 0, 1),
        },
      },
    });

    return `PKG-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private async checkPackageCompletion(packageId: string): Promise<void> {
    const items = await this.prisma.clientPackageItem.findMany({
      where: { clientPackageId: packageId },
    });

    const allUsed = items.every(
      (item) => item.usedQuantity + item.cancelledQuantity >= item.quantity,
    );

    if (allUsed) {
      await this.prisma.clientPackage.update({
        where: { id: packageId },
        data: {
          status: ClientPackageStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }
  }

  private async createPaymentTransaction(
    tenantId: string,
    packageId: string,
    clientId: string,
    amount: number,
    paymentMethod: string | undefined,
    userId: string,
  ): Promise<void> {
    // Buscar ou criar categoria de receita para pacotes
    let category = await this.prisma.financialCategory.findFirst({
      where: {
        tenantId,
        name: 'Pacotes de Serviços',
        type: 'INCOME',
      },
    });

    if (!category) {
      category = await this.prisma.financialCategory.create({
        data: {
          tenantId,
          name: 'Pacotes de Serviços',
          type: 'INCOME',
          color: '#9C27B0',
        },
      });
    }

    // Buscar método de pagamento se especificado
    let paymentMethodId: string | undefined;
    if (paymentMethod) {
      const method = await this.prisma.paymentMethod.findFirst({
        where: {
          tenantId,
          name: { contains: paymentMethod, mode: 'insensitive' },
        },
      });
      paymentMethodId = method?.id;
    }

    await this.prisma.financialTransaction.create({
      data: {
        tenantId,
        type: 'INCOME',
        categoryId: category.id,
        paymentMethodId,
        amount,
        netAmount: amount,
        date: new Date(),
        paidAt: new Date(),
        description: 'Pagamento de pacote de serviços',
        status: 'PAID',
        clientId,
        clientPackageId: packageId,
        createdBy: userId,
      },
    });
  }

  private mapTemplateToResponse(template: any): PackageTemplateResponseDto {
    const originalPrice = template.originalPrice.toNumber();
    const salePrice = template.salePrice.toNumber();
    const discountPercent =
      originalPrice > 0
        ? ((originalPrice - salePrice) / originalPrice) * 100
        : 0;

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      code: template.code,
      validityDays: template.validityDays,
      validityType: template.validityType,
      originalPrice,
      salePrice,
      discountPercent,
      isActive: template.isActive,
      allowPartialUse: template.allowPartialUse,
      transferable: template.transferable,
      maxInstallments: template.maxInstallments,
      items: template.items.map((item: any) => ({
        id: item.id,
        serviceId: item.serviceId,
        serviceName: item.service.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice?.toNumber(),
        servicePrice: item.service.price.toNumber(),
      })),
      createdAt: template.createdAt,
    };
  }

  private mapClientPackageToResponse(pkg: any): ClientPackageResponseDto {
    const items = pkg.items.map((item: any) => {
      const usedQuantity = item.usages
        ? item.usages
            .filter((u: any) => u.status === PackageUsageStatus.USED)
            .reduce((sum: number, u: any) => sum + u.quantity, 0)
        : item.usedQuantity;

      const availableQuantity =
        item.quantity - usedQuantity - item.cancelledQuantity;
      const unitPrice = item.unitPrice.toNumber();

      return {
        id: item.id,
        serviceId: item.serviceId,
        serviceName: item.service.name,
        quantity: item.quantity,
        usedQuantity,
        availableQuantity,
        cancelledQuantity: item.cancelledQuantity,
        unitPrice,
        totalValue: item.quantity * unitPrice,
        usedValue: usedQuantity * unitPrice,
      };
    });

    const totalItems = items.reduce(
      (sum: number, item: any) => sum + item.quantity,
      0,
    );
    const usedItems = items.reduce(
      (sum: number, item: any) => sum + item.usedQuantity,
      0,
    );
    const availableItems = items.reduce(
      (sum: number, item: any) => sum + item.availableQuantity,
      0,
    );
    const totalValue = items.reduce(
      (sum: number, item: any) => sum + item.totalValue,
      0,
    );
    const usedValue = items.reduce(
      (sum: number, item: any) => sum + item.usedValue,
      0,
    );

    const salePrice = pkg.salePrice.toNumber();
    const discountAmount = pkg.discountAmount.toNumber();
    const paidAmount = pkg.paidAmount.toNumber();

    let daysUntilExpiry: number | undefined;
    if (pkg.expiresAt) {
      const now = new Date();
      const diffTime = pkg.expiresAt.getTime() - now.getTime();
      daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      id: pkg.id,
      clientId: pkg.clientId,
      clientName: pkg.client.name,
      name: pkg.name,
      description: pkg.description,
      code: pkg.code,
      status: pkg.status,
      purchaseDate: pkg.purchaseDate,
      activationDate: pkg.activationDate,
      expiresAt: pkg.expiresAt,
      daysUntilExpiry,
      originalPrice: pkg.originalPrice.toNumber(),
      salePrice,
      discountAmount,
      paidAmount,
      remainingAmount: salePrice - discountAmount - paidAmount,
      paymentMethod: pkg.paymentMethod,
      installments: pkg.installments,
      notes: pkg.notes,
      items,
      usageStats: {
        totalItems,
        usedItems,
        availableItems,
        usagePercent: totalItems > 0 ? (usedItems / totalItems) * 100 : 0,
        totalValue,
        usedValue,
        availableValue: totalValue - usedValue,
      },
      createdAt: pkg.createdAt,
    };
  }

  private mapUsageToResponse(usage: any): ClientPackageUsageResponseDto {
    return {
      id: usage.id,
      clientPackageId: usage.clientPackageId,
      packageName: usage.clientPackage.name,
      clientName: usage.clientPackage.client.name,
      serviceId: usage.clientPackageItem.serviceId,
      serviceName: usage.clientPackageItem.service.name,
      quantity: usage.quantity,
      usedAt: usage.usedAt,
      usedById: usage.usedById,
      usedByName: undefined, // Would need to join with User
      providerId: usage.providerId,
      providerName: undefined, // Would need to join with Provider
      appointmentId: usage.appointmentId,
      status: usage.status,
      notes: usage.notes,
      cancelledAt: usage.cancelledAt,
      cancellationReason: usage.cancellationReason,
    };
  }
}
