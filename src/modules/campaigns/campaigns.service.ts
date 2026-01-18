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
  UpdateCampaignStatusDto,
  QueryCampaignsDto,
  PreviewCampaignDto,
  SendCampaignDto,
  CampaignFiltersDto,
} from './dto';
import {
  MessageBlastStatus,
  NotificationStatus,
  AppointmentStatus,
  Prisma,
  Client,
} from '@prisma/client';

@Injectable()
export class CampaignsService {
  private readonly CACHE_PREFIX = 'campaigns';
  private readonly CACHE_TTL = 300; // 5 minutos

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // CAMPAIGNS - CRUD
  // ============================================================================

  async findAll(tenantId: string, query?: QueryCampaignsDto) {
    const where: Prisma.MessageBlastWhereInput = { tenantId };

    if (query?.type) {
      where.type = query.type;
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.channel) {
      where.channel = query.channel;
    }

    if (query?.startDate) {
      where.createdAt = { gte: new Date(query.startDate) };
    }

    if (query?.endDate) {
      where.createdAt = { ...where.createdAt as object, lte: new Date(query.endDate) };
    }

    const [campaigns, total] = await Promise.all([
      this.prisma.messageBlast.findMany({
        where,
        include: {
          template: {
            select: { id: true, name: true },
          },
          _count: {
            select: { recipients: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.messageBlast.count({ where }),
    ]);

    // Calcular métricas
    const campaignsWithMetrics = campaigns.map((campaign) => {
      const deliveryRate =
        campaign.sentCount > 0
          ? (campaign.deliveredCount / campaign.sentCount) * 100
          : 0;
      const readRate =
        campaign.deliveredCount > 0
          ? (campaign.readCount / campaign.deliveredCount) * 100
          : 0;
      const failRate =
        campaign.sentCount > 0
          ? (campaign.failedCount / campaign.sentCount) * 100
          : 0;

      return {
        ...campaign,
        deliveryRate: Number(deliveryRate.toFixed(2)),
        readRate: Number(readRate.toFixed(2)),
        failRate: Number(failRate.toFixed(2)),
      };
    });

    return {
      data: campaignsWithMetrics,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findById(id: string, tenantId: string) {
    const campaign = await this.prisma.messageBlast.findFirst({
      where: { id, tenantId },
      include: {
        template: true,
        recipients: {
          take: 100,
          orderBy: { createdAt: 'desc' },
          include: {
            client: {
              select: { id: true, name: true, phone: true, email: true },
            },
          },
        },
        _count: {
          select: { recipients: true },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campanha não encontrada');
    }

    return campaign;
  }

  async create(tenantId: string, dto: CreateCampaignDto, userId?: string) {
    // Validar template se fornecido
    if (dto.templateId) {
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { id: dto.templateId, tenantId },
      });
      if (!template) {
        throw new NotFoundException('Template não encontrado');
      }
    }

    const campaign = await this.prisma.messageBlast.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        channel: dto.channel,
        templateId: dto.templateId,
        subject: dto.subject,
        content: dto.content,
        filters: dto.filters as any,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        skipRecentlyContacted: dto.skipRecentlyContacted ?? true,
        recentContactDays: dto.recentContactDays ?? 7,
        createdBy: userId,
        status: MessageBlastStatus.DRAFT,
      },
      include: {
        template: true,
      },
    });

    return campaign;
  }

  async update(id: string, tenantId: string, dto: UpdateCampaignDto) {
    const existing = await this.findById(id, tenantId);

    // Não permitir edição de campanhas já enviadas
    if (
      existing.status === MessageBlastStatus.SENDING ||
      existing.status === MessageBlastStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Não é possível editar campanhas em envio ou concluídas',
      );
    }

    // Validar template se fornecido
    if (dto.templateId) {
      const template = await this.prisma.notificationTemplate.findFirst({
        where: { id: dto.templateId, tenantId },
      });
      if (!template) {
        throw new NotFoundException('Template não encontrado');
      }
    }

    const campaign = await this.prisma.messageBlast.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        channel: dto.channel,
        templateId: dto.templateId,
        subject: dto.subject,
        content: dto.content,
        filters: dto.filters as any,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        skipRecentlyContacted: dto.skipRecentlyContacted,
        recentContactDays: dto.recentContactDays,
      },
      include: {
        template: true,
      },
    });

    return campaign;
  }

  async updateStatus(id: string, tenantId: string, dto: UpdateCampaignStatusDto) {
    const existing = await this.findById(id, tenantId);

    // Validar transições de status
    const validTransitions: Record<MessageBlastStatus, MessageBlastStatus[]> = {
      [MessageBlastStatus.DRAFT]: [
        MessageBlastStatus.SCHEDULED,
        MessageBlastStatus.SENDING,
        MessageBlastStatus.CANCELLED,
      ],
      [MessageBlastStatus.SCHEDULED]: [
        MessageBlastStatus.SENDING,
        MessageBlastStatus.CANCELLED,
        MessageBlastStatus.PAUSED,
      ],
      [MessageBlastStatus.SENDING]: [
        MessageBlastStatus.PAUSED,
        MessageBlastStatus.CANCELLED,
        MessageBlastStatus.SENT,
        MessageBlastStatus.COMPLETED,
      ],
      [MessageBlastStatus.SENT]: [MessageBlastStatus.COMPLETED],
      [MessageBlastStatus.PAUSED]: [
        MessageBlastStatus.SENDING,
        MessageBlastStatus.CANCELLED,
      ],
      [MessageBlastStatus.COMPLETED]: [],
      [MessageBlastStatus.CANCELLED]: [],
    };

    if (!validTransitions[existing.status].includes(dto.status)) {
      throw new BadRequestException(
        `Não é possível mudar de ${existing.status} para ${dto.status}`,
      );
    }

    const updateData: Prisma.MessageBlastUpdateInput = {
      status: dto.status,
    };

    // Atualizar timestamps baseado no status
    if (dto.status === MessageBlastStatus.SENDING && !existing.startedAt) {
      updateData.startedAt = new Date();
    }

    if (
      dto.status === MessageBlastStatus.COMPLETED ||
      dto.status === MessageBlastStatus.SENT
    ) {
      updateData.completedAt = new Date();
    }

    return this.prisma.messageBlast.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string, tenantId: string) {
    const existing = await this.findById(id, tenantId);

    // Não permitir exclusão de campanhas em envio
    if (existing.status === MessageBlastStatus.SENDING) {
      throw new BadRequestException(
        'Não é possível excluir campanhas em envio',
      );
    }

    await this.prisma.messageBlast.delete({
      where: { id },
    });

    return { success: true };
  }

  // ============================================================================
  // SEGMENTAÇÃO - Buscar clientes que atendem aos filtros
  // ============================================================================

  async getTargetClients(tenantId: string, filters?: CampaignFiltersDto) {
    const where: Prisma.ClientWhereInput = {
      tenantId,
      deletedAt: null,
    };

    // Filtro: tem WhatsApp
    if (filters?.hasWhatsapp) {
      where.OR = [
        { phoneIsWhatsapp: true },
        { whatsapp: { not: null } },
      ];
    }

    // Filtro: tem email
    if (filters?.hasEmail) {
      where.email = { not: null };
    }

    // Filtro: IDs específicos
    if (filters?.clientIds && filters.clientIds.length > 0) {
      where.id = { in: filters.clientIds };
    }

    // Filtro: aniversariantes
    if (filters?.birthdayToday || filters?.birthdayThisWeek || filters?.birthdayThisMonth) {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentDay = today.getDate();

      // Para aniversariantes, usamos raw query ou filtramos depois
      // Por simplicidade, filtramos após buscar
    }

    // Buscar clientes base
    let clients = await this.prisma.client.findMany({
      where,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        whatsapp: true,
        phoneIsWhatsapp: true,
        birthDate: true,
        createdAt: true,
        appointments: {
          select: {
            id: true,
            date: true,
            status: true,
            serviceId: true,
            providerId: true,
          },
          orderBy: { date: 'desc' },
        },
        loyaltyTransactions: {
          select: {
            points: true,
            type: true,
          },
        },
      },
    });

    // Aplicar filtros adicionais
    if (filters) {
      clients = clients.filter((client) => {
        // Filtro: clientes inativos há X dias
        if (filters.inactiveDays) {
          const lastAppointment = client.appointments.find(
            (a) => a.status === AppointmentStatus.COMPLETED,
          );
          if (lastAppointment) {
            const daysSince = Math.floor(
              (Date.now() - new Date(lastAppointment.date).getTime()) /
                (1000 * 60 * 60 * 24),
            );
            if (daysSince < filters.inactiveDays) {
              return false;
            }
          } else {
            // Cliente nunca teve agendamento concluído
            const daysSinceCreated = Math.floor(
              (Date.now() - new Date(client.createdAt).getTime()) /
                (1000 * 60 * 60 * 24),
            );
            if (daysSinceCreated < filters.inactiveDays) {
              return false;
            }
          }
        }

        // Filtro: mínimo de visitas
        if (filters.minVisits !== undefined) {
          const completedVisits = client.appointments.filter(
            (a) => a.status === AppointmentStatus.COMPLETED,
          ).length;
          if (completedVisits < filters.minVisits) {
            return false;
          }
        }

        // Filtro: máximo de visitas
        if (filters.maxVisits !== undefined) {
          const completedVisits = client.appointments.filter(
            (a) => a.status === AppointmentStatus.COMPLETED,
          ).length;
          if (completedVisits > filters.maxVisits) {
            return false;
          }
        }

        // Filtro: serviços específicos
        if (filters.serviceIds && filters.serviceIds.length > 0) {
          const clientServices = client.appointments.map((a) => a.serviceId);
          const hasService = filters.serviceIds.some((sid) =>
            clientServices.includes(sid),
          );
          if (!hasService) {
            return false;
          }
        }

        // Filtro: profissionais específicos
        if (filters.providerIds && filters.providerIds.length > 0) {
          const clientProviders = client.appointments.map((a) => a.providerId);
          const hasProvider = filters.providerIds.some((pid) =>
            clientProviders.includes(pid),
          );
          if (!hasProvider) {
            return false;
          }
        }

        // Filtro: aniversariantes
        if (client.birthDate) {
          const birthDate = new Date(client.birthDate);
          const today = new Date();
          const birthMonth = birthDate.getMonth();
          const birthDay = birthDate.getDate();
          const currentMonth = today.getMonth();
          const currentDay = today.getDate();

          if (filters.birthdayToday) {
            if (birthMonth !== currentMonth || birthDay !== currentDay) {
              return false;
            }
          }

          if (filters.birthdayThisWeek) {
            // Verificar se aniversário está nos próximos 7 dias
            const thisYearBirthday = new Date(
              today.getFullYear(),
              birthMonth,
              birthDay,
            );
            const diffTime = thisYearBirthday.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < 0 || diffDays > 7) {
              return false;
            }
          }

          if (filters.birthdayThisMonth) {
            if (birthMonth !== currentMonth) {
              return false;
            }
          }
        } else if (
          filters.birthdayToday ||
          filters.birthdayThisWeek ||
          filters.birthdayThisMonth
        ) {
          // Cliente sem data de nascimento não passa filtro de aniversário
          return false;
        }

        // Filtro: pontos de fidelidade
        if (filters.minLoyaltyPoints !== undefined) {
          const totalEarned = client.loyaltyTransactions
            .filter((t) => t.type === 'EARNED' || t.type === 'BONUS')
            .reduce((sum, t) => sum + t.points, 0);
          const totalRedeemed = client.loyaltyTransactions
            .filter((t) => t.type === 'REDEEMED')
            .reduce((sum, t) => sum + Math.abs(t.points), 0);
          const balance = totalEarned - totalRedeemed;
          if (balance < filters.minLoyaltyPoints) {
            return false;
          }
        }

        return true;
      });
    }

    // Retornar clientes simplificados
    return clients.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      whatsapp: c.whatsapp || (c.phoneIsWhatsapp ? c.phone : null),
      appointmentCount: c.appointments.filter(
        (a) => a.status === AppointmentStatus.COMPLETED,
      ).length,
      lastAppointment: c.appointments.find(
        (a) => a.status === AppointmentStatus.COMPLETED,
      )?.date || null,
    }));
  }

  // ============================================================================
  // PREVIEW - Mostrar prévia da mensagem com variáveis substituídas
  // ============================================================================

  async preview(tenantId: string, dto: PreviewCampaignDto) {
    // Buscar clientes que atendem aos filtros
    const targetClients = await this.getTargetClients(tenantId, dto.filters);

    // Buscar um cliente de exemplo
    let sampleClient: Client | null = null;
    if (dto.sampleClientId) {
      sampleClient = await this.prisma.client.findFirst({
        where: { id: dto.sampleClientId, tenantId },
      });
    } else if (targetClients.length > 0) {
      sampleClient = await this.prisma.client.findFirst({
        where: { id: targetClients[0].id },
      });
    }

    // Buscar dados do tenant para substituir variáveis
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    // Substituir variáveis no conteúdo
    let previewContent = dto.content;
    if (sampleClient) {
      previewContent = this.replaceVariables(previewContent, {
        nome: sampleClient.name,
        primeiro_nome: sampleClient.name.split(' ')[0],
        telefone: sampleClient.phone,
        email: sampleClient.email || '',
      });
    }

    if (tenant) {
      previewContent = this.replaceVariables(previewContent, {
        estabelecimento: tenant.name,
        empresa: tenant.name,
      });
    }

    return {
      content: previewContent,
      totalRecipients: targetClients.length,
      sampleRecipients: targetClients.slice(0, 10),
      variables: this.extractVariables(dto.content),
    };
  }

  // ============================================================================
  // SEND - Preparar e enviar campanha
  // ============================================================================

  async send(id: string, tenantId: string, dto?: SendCampaignDto) {
    const campaign = await this.findById(id, tenantId);

    // Validar status
    if (
      campaign.status !== MessageBlastStatus.DRAFT &&
      campaign.status !== MessageBlastStatus.SCHEDULED &&
      campaign.status !== MessageBlastStatus.PAUSED
    ) {
      throw new BadRequestException(
        'Campanha não pode ser enviada neste status',
      );
    }

    // Buscar clientes alvo
    const filters = campaign.filters as CampaignFiltersDto | null;
    const targetClients = await this.getTargetClients(tenantId, filters || undefined);

    if (targetClients.length === 0) {
      throw new BadRequestException(
        'Nenhum cliente encontrado com os filtros selecionados',
      );
    }

    // Filtrar clientes contatados recentemente
    let filteredClients = targetClients;
    if (campaign.skipRecentlyContacted) {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - campaign.recentContactDays);

      const recentlyContacted = await this.prisma.messageBlastRecipient.findMany({
        where: {
          tenantId,
          clientId: { in: targetClients.map((c) => c.id) },
          sentAt: { gte: recentDate },
        },
        select: { clientId: true },
      });

      const recentIds = new Set(recentlyContacted.map((r) => r.clientId));
      filteredClients = targetClients.filter((c) => !recentIds.has(c.id));
    }

    // Criar registros de destinatários
    const recipientsData = filteredClients.map((client) => ({
      tenantId,
      blastId: id,
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.whatsapp || client.phone,
      clientEmail: client.email,
      status: NotificationStatus.PENDING,
    }));

    // Remover destinatários anteriores (caso seja reenvio)
    await this.prisma.messageBlastRecipient.deleteMany({
      where: { blastId: id },
    });

    // Criar novos destinatários
    await this.prisma.messageBlastRecipient.createMany({
      data: recipientsData,
    });

    // Atualizar campanha
    const scheduledAt = dto?.sendNow
      ? null
      : dto?.scheduledAt
      ? new Date(dto.scheduledAt)
      : campaign.scheduledAt;

    const newStatus =
      dto?.sendNow || !scheduledAt
        ? MessageBlastStatus.SENDING
        : MessageBlastStatus.SCHEDULED;

    await this.prisma.messageBlast.update({
      where: { id },
      data: {
        status: newStatus,
        totalRecipients: filteredClients.length,
        scheduledAt,
        startedAt: newStatus === MessageBlastStatus.SENDING ? new Date() : null,
      },
    });

    // TODO: Se sendNow, disparar job de envio via BullMQ
    // await this.campaignQueue.add('send-campaign', { campaignId: id });

    return {
      success: true,
      totalRecipients: filteredClients.length,
      skippedRecently: targetClients.length - filteredClients.length,
      status: newStatus,
      scheduledAt,
    };
  }

  // ============================================================================
  // STATS - Estatísticas da campanha
  // ============================================================================

  async getStats(id: string, tenantId: string) {
    const campaign = await this.findById(id, tenantId);

    // Buscar detalhes dos recipients por status
    const statusCounts = await this.prisma.messageBlastRecipient.groupBy({
      by: ['status'],
      where: { blastId: id },
      _count: { status: true },
    });

    const statusMap = statusCounts.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Calcular métricas
    const total = campaign.totalRecipients;
    const sent = campaign.sentCount;
    const delivered = campaign.deliveredCount;
    const read = campaign.readCount;
    const failed = campaign.failedCount;
    const clicked = campaign.clickCount;

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        type: campaign.type,
        channel: campaign.channel,
        createdAt: campaign.createdAt,
        scheduledAt: campaign.scheduledAt,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
      },
      metrics: {
        total,
        sent,
        delivered,
        read,
        failed,
        clicked,
        pending: statusMap[NotificationStatus.PENDING] || 0,
        sending: statusMap[NotificationStatus.SENDING] || 0,
      },
      rates: {
        sentRate: total > 0 ? ((sent / total) * 100).toFixed(2) : 0,
        deliveryRate: sent > 0 ? ((delivered / sent) * 100).toFixed(2) : 0,
        readRate: delivered > 0 ? ((read / delivered) * 100).toFixed(2) : 0,
        failRate: sent > 0 ? ((failed / sent) * 100).toFixed(2) : 0,
        clickRate: delivered > 0 ? ((clicked / delivered) * 100).toFixed(2) : 0,
      },
    };
  }

  // ============================================================================
  // RECIPIENTS - Listar destinatários
  // ============================================================================

  async getRecipients(
    id: string,
    tenantId: string,
    query?: { status?: NotificationStatus; limit?: number; offset?: number },
  ) {
    // Verificar se campanha existe
    await this.findById(id, tenantId);

    const where: Prisma.MessageBlastRecipientWhereInput = {
      blastId: id,
      tenantId,
    };

    if (query?.status) {
      where.status = query.status;
    }

    const [recipients, total] = await Promise.all([
      this.prisma.messageBlastRecipient.findMany({
        where,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.messageBlastRecipient.count({ where }),
    ]);

    return {
      data: recipients,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  // ============================================================================
  // TEMPLATES - Listar templates disponíveis
  // ============================================================================

  async getTemplates(tenantId: string) {
    return this.prisma.notificationTemplate.findMany({
      where: {
        tenantId,
        type: 'CAMPAIGN_MESSAGE',
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  // ============================================================================
  // DASHBOARD STATS
  // ============================================================================

  async getDashboardStats(tenantId: string) {
    const [
      totalCampaigns,
      activeCampaigns,
      totalSent,
      totalDelivered,
      recentCampaigns,
    ] = await Promise.all([
      this.prisma.messageBlast.count({ where: { tenantId } }),
      this.prisma.messageBlast.count({
        where: {
          tenantId,
          status: {
            in: [MessageBlastStatus.SENDING, MessageBlastStatus.SCHEDULED],
          },
        },
      }),
      this.prisma.messageBlast.aggregate({
        where: { tenantId },
        _sum: { sentCount: true },
      }),
      this.prisma.messageBlast.aggregate({
        where: { tenantId },
        _sum: { deliveredCount: true },
      }),
      this.prisma.messageBlast.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          totalRecipients: true,
          sentCount: true,
          deliveredCount: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      totalCampaigns,
      activeCampaigns,
      totalMessagesSent: totalSent._sum.sentCount || 0,
      totalMessagesDelivered: totalDelivered._sum.deliveredCount || 0,
      recentCampaigns,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private replaceVariables(
    content: string,
    variables: Record<string, string>,
  ): string {
    let result = content;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
      result = result.replace(regex, value || '');
    }
    return result;
  }

  private extractVariables(content: string): string[] {
    const regex = /\{\{\s*(\w+)\s*\}\}/g;
    const variables: string[] = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    return variables;
  }
}
