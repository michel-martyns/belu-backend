import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  UpdateCampaignMetricsDto,
  CreateCampaignExpenseDto,
  CreateSocialPostDto,
  UpdateSocialPostDto,
  UpdatePostMetricsDto,
  QueryCampaignsDto,
  QueryPostsDto,
  MarketingReportDto,
} from './dto';
import { CampaignStatus, PostStatus, Prisma, LeadStage } from '@prisma/client';

@Injectable()
export class MarketingService {
  private readonly CACHE_PREFIX = 'marketing';
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // CAMPAIGNS - CRUD
  // ============================================================================

  async findAllCampaigns(tenantId: string, query?: QueryCampaignsDto) {
    const where: Prisma.MarketingCampaignWhereInput = { tenantId };

    if (query?.platform) {
      where.platform = query.platform;
    }

    if (query?.type) {
      where.type = query.type;
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.startDate || query?.endDate) {
      if (query.startDate) {
        where.startDate = { gte: new Date(query.startDate) };
      }
      if (query.endDate) {
        where.endDate = { lte: new Date(query.endDate) };
      }
    }

    const [campaigns, total] = await Promise.all([
      this.prisma.marketingCampaign.findMany({
        where,
        include: {
          _count: {
            select: { leads: true, expenses: true, posts: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.marketingCampaign.count({ where }),
    ]);

    // Calcular métricas adicionais
    const campaignsWithMetrics = campaigns.map((campaign) => {
      const ctr = campaign.impressions > 0
        ? (campaign.clicks / campaign.impressions) * 100
        : 0;
      const cpc = campaign.clicks > 0
        ? Number(campaign.totalSpent) / campaign.clicks
        : 0;
      const cpl = campaign._count.leads > 0
        ? Number(campaign.totalSpent) / campaign._count.leads
        : 0;

      return {
        ...campaign,
        ctr: Number(ctr.toFixed(2)),
        cpc: Number(cpc.toFixed(2)),
        cpl: Number(cpl.toFixed(2)),
      };
    });

    return {
      data: campaignsWithMetrics,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findCampaignById(id: string, tenantId: string) {
    const campaign = await this.prisma.marketingCampaign.findFirst({
      where: { id, tenantId },
      include: {
        leads: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            stage: true,
            createdAt: true,
          },
        },
        expenses: {
          orderBy: { date: 'desc' },
          take: 30,
        },
        posts: {
          orderBy: { scheduledAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { leads: true, expenses: true, posts: true },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    // Calcular métricas
    const ctr = campaign.impressions > 0
      ? (campaign.clicks / campaign.impressions) * 100
      : 0;
    const cpc = campaign.clicks > 0
      ? Number(campaign.totalSpent) / campaign.clicks
      : 0;
    const cpl = campaign._count.leads > 0
      ? Number(campaign.totalSpent) / campaign._count.leads
      : 0;

    return {
      ...campaign,
      ctr: Number(ctr.toFixed(2)),
      cpc: Number(cpc.toFixed(2)),
      cpl: Number(cpl.toFixed(2)),
    };
  }

  async createCampaign(tenantId: string, dto: CreateCampaignDto) {
    const campaign = await this.prisma.marketingCampaign.create({
      data: {
        tenantId,
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });

    await this.invalidateCache(tenantId);
    return campaign;
  }

  async updateCampaign(id: string, tenantId: string, dto: UpdateCampaignDto) {
    await this.findCampaignById(id, tenantId);

    const updateData: Prisma.MarketingCampaignUpdateInput = { ...dto };
    if (dto.startDate) {
      updateData.startDate = new Date(dto.startDate);
    }
    if (dto.endDate) {
      updateData.endDate = new Date(dto.endDate);
    }

    const campaign = await this.prisma.marketingCampaign.update({
      where: { id },
      data: updateData,
    });

    await this.invalidateCache(tenantId);
    return campaign;
  }

  async updateCampaignMetrics(
    id: string,
    tenantId: string,
    dto: UpdateCampaignMetricsDto,
  ) {
    await this.findCampaignById(id, tenantId);

    const campaign = await this.prisma.marketingCampaign.update({
      where: { id },
      data: dto,
    });

    await this.invalidateCache(tenantId);
    return campaign;
  }

  async deleteCampaign(id: string, tenantId: string) {
    await this.findCampaignById(id, tenantId);

    await this.prisma.marketingCampaign.delete({ where: { id } });
    await this.invalidateCache(tenantId);

    return { message: 'Campanha excluída com sucesso' };
  }

  // ============================================================================
  // CAMPAIGN EXPENSES
  // ============================================================================

  async addCampaignExpense(
    campaignId: string,
    tenantId: string,
    dto: CreateCampaignExpenseDto,
  ) {
    const campaign = await this.findCampaignById(campaignId, tenantId);

    const expense = await this.prisma.$transaction(async (prisma) => {
      // Criar despesa
      const exp = await prisma.campaignExpense.create({
        data: {
          tenantId,
          campaignId,
          date: new Date(dto.date),
          amount: dto.amount,
          description: dto.description,
          impressions: dto.impressions,
          clicks: dto.clicks,
          conversions: dto.conversions,
        },
      });

      // Atualizar totalSpent da campanha
      await prisma.marketingCampaign.update({
        where: { id: campaignId },
        data: {
          totalSpent: {
            increment: dto.amount,
          },
          impressions: dto.impressions
            ? { increment: dto.impressions }
            : undefined,
          clicks: dto.clicks ? { increment: dto.clicks } : undefined,
          conversions: dto.conversions
            ? { increment: dto.conversions }
            : undefined,
        },
      });

      return exp;
    });

    await this.invalidateCache(tenantId);
    return expense;
  }

  async getCampaignExpenses(campaignId: string, tenantId: string) {
    await this.findCampaignById(campaignId, tenantId);

    return this.prisma.campaignExpense.findMany({
      where: { campaignId, tenantId },
      orderBy: { date: 'desc' },
    });
  }

  // ============================================================================
  // SOCIAL POSTS
  // ============================================================================

  async findAllPosts(tenantId: string, query?: QueryPostsDto) {
    const where: Prisma.SocialPostWhereInput = { tenantId };

    if (query?.campaignId) {
      where.campaignId = query.campaignId;
    }

    if (query?.platform) {
      where.platform = query.platform;
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.startDate || query?.endDate) {
      where.scheduledAt = {};
      if (query.startDate) {
        where.scheduledAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.scheduledAt.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [posts, total] = await Promise.all([
      this.prisma.socialPost.findMany({
        where,
        include: {
          campaign: {
            select: { id: true, name: true },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.socialPost.count({ where }),
    ]);

    return {
      data: posts,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findPostById(id: string, tenantId: string) {
    const post = await this.prisma.socialPost.findFirst({
      where: { id, tenantId },
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Post não encontrado');
    }

    return post;
  }

  async createPost(tenantId: string, dto: CreateSocialPostDto, userId?: string) {
    // Verificar se campanha existe se fornecida
    if (dto.campaignId) {
      await this.findCampaignById(dto.campaignId, tenantId);
    }

    const post = await this.prisma.socialPost.create({
      data: {
        tenantId,
        ...dto,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        createdBy: userId,
      },
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
    });

    await this.invalidateCache(tenantId);
    return post;
  }

  async updatePost(id: string, tenantId: string, dto: UpdateSocialPostDto) {
    await this.findPostById(id, tenantId);

    const updateData: Prisma.SocialPostUpdateInput = { ...dto };
    if (dto.scheduledAt) {
      updateData.scheduledAt = new Date(dto.scheduledAt);
    }

    const post = await this.prisma.socialPost.update({
      where: { id },
      data: updateData,
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
    });

    await this.invalidateCache(tenantId);
    return post;
  }

  async updatePostMetrics(id: string, tenantId: string, dto: UpdatePostMetricsDto) {
    await this.findPostById(id, tenantId);

    const post = await this.prisma.socialPost.update({
      where: { id },
      data: dto,
    });

    await this.invalidateCache(tenantId);
    return post;
  }

  async markPostAsPublished(id: string, tenantId: string) {
    await this.findPostById(id, tenantId);

    const post = await this.prisma.socialPost.update({
      where: { id },
      data: {
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    await this.invalidateCache(tenantId);
    return post;
  }

  async deletePost(id: string, tenantId: string) {
    await this.findPostById(id, tenantId);

    await this.prisma.socialPost.delete({ where: { id } });
    await this.invalidateCache(tenantId);

    return { message: 'Post excluído com sucesso' };
  }

  // ============================================================================
  // CALENDAR - Posts agendados
  // ============================================================================

  async getPostsCalendar(tenantId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const posts = await this.prisma.socialPost.findMany({
      where: {
        tenantId,
        scheduledAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });

    // Agrupar por data
    const calendar: Record<string, typeof posts> = {};
    posts.forEach((post) => {
      if (post.scheduledAt) {
        const dateKey = post.scheduledAt.toISOString().split('T')[0];
        if (!calendar[dateKey]) {
          calendar[dateKey] = [];
        }
        calendar[dateKey].push(post);
      }
    });

    return calendar;
  }

  // ============================================================================
  // CAMPAIGN TRACKING - Vinculação campanha → lead → cliente
  // ============================================================================

  async getCampaignLeads(campaignId: string, tenantId: string) {
    await this.findCampaignById(campaignId, tenantId);

    return this.prisma.lead.findMany({
      where: { campaignId, tenantId },
      include: {
        convertedClient: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaignConversions(campaignId: string, tenantId: string) {
    await this.findCampaignById(campaignId, tenantId);

    const leads = await this.prisma.lead.findMany({
      where: { campaignId, tenantId },
      include: {
        convertedClient: true,
      },
    });

    const totalLeads = leads.length;
    const convertedLeads = leads.filter((l) => l.stage === LeadStage.WON).length;
    const conversionRate = totalLeads > 0
      ? (convertedLeads / totalLeads) * 100
      : 0;

    // Calcular valor total dos clientes convertidos
    const clientIds = leads
      .filter((l) => l.convertedClientId)
      .map((l) => l.convertedClientId as string);

    const revenue = await this.prisma.financialTransaction.aggregate({
      where: {
        tenantId,
        clientId: { in: clientIds },
        type: 'INCOME',
        status: 'PAID',
      },
      _sum: { netAmount: true },
    });

    return {
      totalLeads,
      convertedLeads,
      conversionRate: Number(conversionRate.toFixed(2)),
      totalRevenue: Number(revenue._sum?.netAmount || 0),
    };
  }

  // ============================================================================
  // REPORTS
  // ============================================================================

  async getMarketingOverview(tenantId: string, query: MarketingReportDto) {
    const dateFilter = {
      gte: new Date(query.startDate),
      lte: new Date(query.endDate + 'T23:59:59.999Z'),
    };

    const platformFilter = query.platform ? { platform: query.platform } : {};

    // Totais de campanhas ativas
    const campaignStats = await this.prisma.marketingCampaign.aggregate({
      where: {
        tenantId,
        ...platformFilter,
        OR: [
          { startDate: dateFilter },
          { createdAt: dateFilter },
        ],
      },
      _sum: {
        totalSpent: true,
        impressions: true,
        clicks: true,
        conversions: true,
      },
      _count: true,
    });

    // Leads gerados por campanhas no período
    const leadsFromCampaigns = await this.prisma.lead.count({
      where: {
        tenantId,
        campaignId: { not: null },
        createdAt: dateFilter,
      },
    });

    // Leads convertidos
    const convertedLeads = await this.prisma.lead.count({
      where: {
        tenantId,
        campaignId: { not: null },
        stage: LeadStage.WON,
        convertedAt: dateFilter,
      },
    });

    const totalSpent = Number(campaignStats._sum.totalSpent || 0);
    const totalImpressions = campaignStats._sum.impressions || 0;
    const totalClicks = campaignStats._sum.clicks || 0;

    const ctr = totalImpressions > 0
      ? (totalClicks / totalImpressions) * 100
      : 0;
    const cpc = totalClicks > 0 ? totalSpent / totalClicks : 0;
    const cpl = leadsFromCampaigns > 0 ? totalSpent / leadsFromCampaigns : 0;
    const conversionRate = leadsFromCampaigns > 0
      ? (convertedLeads / leadsFromCampaigns) * 100
      : 0;

    return {
      period: { startDate: query.startDate, endDate: query.endDate },
      campaigns: campaignStats._count,
      totalSpent,
      totalImpressions,
      totalClicks,
      leadsGenerated: leadsFromCampaigns,
      conversions: convertedLeads,
      metrics: {
        ctr: Number(ctr.toFixed(2)),
        cpc: Number(cpc.toFixed(2)),
        cpl: Number(cpl.toFixed(2)),
        conversionRate: Number(conversionRate.toFixed(2)),
      },
    };
  }

  async getROIByPlatform(tenantId: string, query: MarketingReportDto) {
    const dateFilter = {
      gte: new Date(query.startDate),
      lte: new Date(query.endDate + 'T23:59:59.999Z'),
    };

    const platforms = await this.prisma.marketingCampaign.groupBy({
      by: ['platform'],
      where: {
        tenantId,
        createdAt: dateFilter,
      },
      _sum: {
        totalSpent: true,
        impressions: true,
        clicks: true,
        conversions: true,
      },
      _count: true,
    });

    return platforms.map((p) => ({
      platform: p.platform,
      campaigns: p._count,
      totalSpent: Number(p._sum.totalSpent || 0),
      impressions: p._sum.impressions || 0,
      clicks: p._sum.clicks || 0,
      conversions: p._sum.conversions || 0,
      ctr:
        p._sum.impressions && p._sum.impressions > 0
          ? Number(
              (((p._sum.clicks || 0) / p._sum.impressions) * 100).toFixed(2),
            )
          : 0,
    }));
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async invalidateCache(tenantId: string) {
    const pattern = `${this.CACHE_PREFIX}:${tenantId}:*`;
    await this.redis.delByPattern(pattern);
  }
}
