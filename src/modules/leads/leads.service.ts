import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  ChangeStageDto,
  ConvertLeadDto,
  CreateInteractionDto,
  CreateTagDto,
  UpdateTagDto,
  QueryLeadsDto,
  LeadsByStageDto,
} from './dto';
import { LeadStage, InteractionType, Prisma } from '@prisma/client';

@Injectable()
export class LeadsService {
  private readonly CACHE_PREFIX = 'leads';
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // LEADS - CRUD
  // ============================================================================

  async findAll(tenantId: string, query?: QueryLeadsDto) {
    const where: Prisma.LeadWhereInput = { tenantId };

    if (query?.stage) {
      where.stage = query.stage;
    }

    if (query?.source) {
      where.source = query.source;
    }

    if (query?.priority) {
      where.priority = query.priority;
    }

    if (query?.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
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

    if (query?.hasFollowUpToday) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      where.nextFollowUpAt = {
        gte: today,
        lt: tomorrow,
      };
    }

    if (query?.overdueFollowUp) {
      where.nextFollowUpAt = {
        lt: new Date(),
      };
      where.stage = {
        notIn: [LeadStage.WON, LeadStage.LOST],
      };
    }

    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
        { whatsapp: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query?.tagIds && query.tagIds.length > 0) {
      where.tags = {
        some: {
          id: { in: query.tagIds },
        },
      };
    }

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
          tags: true,
          _count: {
            select: { interactions: true },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { nextFollowUpAt: 'asc' },
          { createdAt: 'desc' },
        ],
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data: leads,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findById(id: string, tenantId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        tags: true,
        interactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        convertedClient: true,
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead não encontrado');
    }

    return lead;
  }

  async create(tenantId: string, dto: CreateLeadDto, userId?: string) {
    const { tagIds, ...leadData } = dto;

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        ...leadData,
        tags: tagIds
          ? {
              connect: tagIds.map((id) => ({ id })),
            }
          : undefined,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        tags: true,
      },
    });

    // Registrar interação de criação
    await this.createInteraction(lead.id, tenantId, {
      type: InteractionType.NOTE,
      title: 'Lead criado',
      description: `Lead cadastrado no sistema`,
    }, userId);

    await this.invalidateCache(tenantId);
    return lead;
  }

  async update(id: string, tenantId: string, dto: UpdateLeadDto) {
    await this.findById(id, tenantId);

    const { tagIds, ...updateData } = dto;

    const lead = await this.prisma.lead.update({
      where: { id },
      data: {
        ...updateData,
        tags: tagIds
          ? {
              set: tagIds.map((tagId) => ({ id: tagId })),
            }
          : undefined,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        tags: true,
      },
    });

    await this.invalidateCache(tenantId);
    return lead;
  }

  async delete(id: string, tenantId: string) {
    await this.findById(id, tenantId);

    await this.prisma.lead.delete({ where: { id } });
    await this.invalidateCache(tenantId);

    return { message: 'Lead excluído com sucesso' };
  }

  // ============================================================================
  // PIPELINE - Mudança de estágio
  // ============================================================================

  async changeStage(
    id: string,
    tenantId: string,
    dto: ChangeStageDto,
    userId?: string,
  ) {
    const lead = await this.findById(id, tenantId);

    // Validações
    if (dto.stage === LeadStage.LOST && !dto.lostReason) {
      throw new BadRequestException('Motivo da perda é obrigatório');
    }

    if (lead.stage === LeadStage.WON) {
      throw new BadRequestException('Lead já foi convertido');
    }

    const previousStage = lead.stage;

    const updateData: Prisma.LeadUpdateInput = {
      stage: dto.stage,
    };

    if (dto.stage === LeadStage.LOST) {
      updateData.lostReason = dto.lostReason;
      updateData.lostAt = new Date();
      updateData.isActive = false;
    }

    if (dto.stage === LeadStage.CONTACTED && !lead.lastContactAt) {
      updateData.lastContactAt = new Date();
    }

    const updatedLead = await this.prisma.lead.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        tags: true,
      },
    });

    // Registrar interação de mudança de estágio
    await this.createInteraction(id, tenantId, {
      type: InteractionType.STAGE_CHANGE,
      title: `Estágio alterado: ${previousStage} → ${dto.stage}`,
      description: dto.notes,
    }, userId);

    await this.invalidateCache(tenantId);
    return updatedLead;
  }

  // ============================================================================
  // CONVERSÃO - Lead para Cliente
  // ============================================================================

  async convertToClient(
    id: string,
    tenantId: string,
    dto: ConvertLeadDto,
    userId?: string,
  ) {
    const lead = await this.findById(id, tenantId);

    if (lead.stage === LeadStage.WON) {
      throw new BadRequestException('Lead já foi convertido');
    }

    if (lead.stage === LeadStage.LOST) {
      throw new BadRequestException('Não é possível converter um lead perdido');
    }

    // Verificar se já existe cliente com mesmo email ou telefone
    const existingClient = await this.prisma.client.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          lead.email ? { email: lead.email } : {},
          lead.phone ? { phone: lead.phone } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
    });

    if (existingClient) {
      throw new ConflictException(
        `Já existe um cliente com esse ${existingClient.email === lead.email ? 'email' : 'telefone'}`,
      );
    }

    // Criar cliente e atualizar lead em transação
    const result = await this.prisma.$transaction(async (prisma) => {
      // Criar cliente
      const client = await prisma.client.create({
        data: {
          tenantId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone || lead.whatsapp || '',
          notes: dto.clientNotes || lead.notes,
        },
      });

      // Atualizar lead
      const updatedLead = await prisma.lead.update({
        where: { id },
        data: {
          stage: LeadStage.WON,
          convertedAt: new Date(),
          convertedClientId: client.id,
          isActive: false,
        },
      });

      return { lead: updatedLead, client };
    });

    // Registrar interação de conversão
    await this.createInteraction(id, tenantId, {
      type: InteractionType.NOTE,
      title: 'Lead convertido em cliente',
      description: dto.notes || `Cliente criado: ${result.client.name}`,
    }, userId);

    await this.invalidateCache(tenantId);

    return {
      message: 'Lead convertido com sucesso',
      lead: result.lead,
      client: result.client,
    };
  }

  // ============================================================================
  // INTERAÇÕES - Histórico de contatos
  // ============================================================================

  async getInteractions(leadId: string, tenantId: string) {
    // Verificar se lead existe
    await this.findById(leadId, tenantId);

    return this.prisma.leadInteraction.findMany({
      where: { leadId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInteraction(
    leadId: string,
    tenantId: string,
    dto: CreateInteractionDto,
    userId?: string,
  ) {
    // Verificar se lead existe
    const lead = await this.findById(leadId, tenantId);

    const interaction = await this.prisma.leadInteraction.create({
      data: {
        tenantId,
        leadId,
        ...dto,
        createdBy: userId,
      },
    });

    // Atualizar lastContactAt se for interação de contato
    const contactTypes: InteractionType[] = [
      InteractionType.CALL,
      InteractionType.WHATSAPP,
      InteractionType.EMAIL,
      InteractionType.MEETING,
    ];

    if (contactTypes.includes(dto.type)) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { lastContactAt: new Date() },
      });
    }

    return interaction;
  }

  // ============================================================================
  // TAGS
  // ============================================================================

  async findAllTags(tenantId: string) {
    const cacheKey = `${this.CACHE_PREFIX}:${tenantId}:tags`;
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) return JSON.parse(cached);

    const tags = await this.prisma.leadTag.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { leads: true },
        },
      },
    });

    await this.redis.set(cacheKey, JSON.stringify(tags), this.CACHE_TTL);
    return tags;
  }

  async createTag(tenantId: string, dto: CreateTagDto) {
    const tag = await this.prisma.leadTag.create({
      data: {
        tenantId,
        ...dto,
      },
    });

    await this.invalidateCache(tenantId);
    return tag;
  }

  async updateTag(id: string, tenantId: string, dto: UpdateTagDto) {
    const tag = await this.prisma.leadTag.findFirst({
      where: { id, tenantId },
    });

    if (!tag) {
      throw new NotFoundException('Tag não encontrada');
    }

    const updated = await this.prisma.leadTag.update({
      where: { id },
      data: dto,
    });

    await this.invalidateCache(tenantId);
    return updated;
  }

  async deleteTag(id: string, tenantId: string) {
    const tag = await this.prisma.leadTag.findFirst({
      where: { id, tenantId },
    });

    if (!tag) {
      throw new NotFoundException('Tag não encontrada');
    }

    await this.prisma.leadTag.delete({ where: { id } });
    await this.invalidateCache(tenantId);

    return { message: 'Tag excluída com sucesso' };
  }

  // ============================================================================
  // RELATÓRIOS E ESTATÍSTICAS
  // ============================================================================

  async getLeadsByStage(tenantId: string, query?: LeadsByStageDto) {
    const where: Prisma.LeadWhereInput = { tenantId };

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const stages = await this.prisma.lead.groupBy({
      by: ['stage'],
      where,
      _count: true,
      _sum: {
        estimatedValue: true,
      },
    });

    // Ordenar por ordem do funil
    const stageOrder = [
      LeadStage.NEW,
      LeadStage.CONTACTED,
      LeadStage.QUALIFIED,
      LeadStage.PROPOSAL,
      LeadStage.NEGOTIATION,
      LeadStage.WON,
      LeadStage.LOST,
    ];

    return stageOrder.map((stage) => {
      const data = stages.find((s) => s.stage === stage);
      return {
        stage,
        count: data?._count || 0,
        estimatedValue: Number(data?._sum?.estimatedValue || 0),
      };
    });
  }

  async getLeadsBySource(tenantId: string, query?: LeadsByStageDto) {
    const where: Prisma.LeadWhereInput = { tenantId };

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const sources = await this.prisma.lead.groupBy({
      by: ['source'],
      where,
      _count: true,
    });

    return sources.map((s) => ({
      source: s.source,
      count: s._count,
    }));
  }

  async getConversionMetrics(tenantId: string, query?: LeadsByStageDto) {
    const where: Prisma.LeadWhereInput = { tenantId };

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [totalLeads, wonLeads, lostLeads, activeLeads] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, stage: LeadStage.WON } }),
      this.prisma.lead.count({ where: { ...where, stage: LeadStage.LOST } }),
      this.prisma.lead.count({
        where: {
          ...where,
          stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
        },
      }),
    ]);

    const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;
    const lossRate = totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0;

    // Valor médio dos leads ganhos
    const avgValue = await this.prisma.lead.aggregate({
      where: { ...where, stage: LeadStage.WON },
      _avg: { estimatedValue: true },
    });

    return {
      totalLeads,
      wonLeads,
      lostLeads,
      activeLeads,
      conversionRate: Number(conversionRate.toFixed(2)),
      lossRate: Number(lossRate.toFixed(2)),
      averageValue: Number(avgValue._avg?.estimatedValue || 0),
    };
  }

  async getFollowUpsToday(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.lead.findMany({
      where: {
        tenantId,
        nextFollowUpAt: {
          gte: today,
          lt: tomorrow,
        },
        stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
      },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
      orderBy: { nextFollowUpAt: 'asc' },
    });
  }

  async getOverdueFollowUps(tenantId: string) {
    return this.prisma.lead.findMany({
      where: {
        tenantId,
        nextFollowUpAt: { lt: new Date() },
        stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
      },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
      orderBy: { nextFollowUpAt: 'asc' },
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async invalidateCache(tenantId: string) {
    const pattern = `${this.CACHE_PREFIX}:${tenantId}:*`;
    await this.redis.delByPattern(pattern);
  }
}
