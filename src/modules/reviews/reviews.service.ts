import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateReviewDto,
  RespondReviewDto,
  QueryReviewsDto,
  ReviewResponse,
  ProviderStatsResponse,
  PendingReviewResponse,
} from './dto';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  // ============================================================================
  // CRIAR AVALIAÇÃO (Cliente)
  // ============================================================================

  async create(
    clientId: string,
    tenantId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponse> {
    // Buscar o agendamento
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: {
        client: true,
        provider: true,
        service: true,
        review: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Verificar se o agendamento pertence ao cliente
    if (appointment.clientId !== clientId) {
      throw new ForbiddenException(
        'Você não pode avaliar este agendamento',
      );
    }

    // Verificar se o agendamento foi concluído
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        'Só é possível avaliar agendamentos concluídos',
      );
    }

    // Verificar se já existe avaliação
    if (appointment.review) {
      throw new BadRequestException(
        'Este agendamento já foi avaliado',
      );
    }

    // Criar a avaliação
    const review = await this.prisma.review.create({
      data: {
        tenantId: appointment.tenantId,
        providerId: appointment.providerId,
        clientId,
        appointmentId: dto.appointmentId,
        rating: dto.rating,
        comment: dto.comment,
      },
      include: {
        client: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            service: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Atualizar estatísticas do provider
    await this.updateProviderStats(appointment.providerId, tenantId);

    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      response: review.response,
      respondedAt: review.respondedAt,
      isVisible: review.isVisible,
      createdAt: review.createdAt,
      client: review.client,
      provider: review.provider,
      service: review.appointment.service,
      appointment: {
        id: review.appointment.id,
        date: review.appointment.date,
      },
    };
  }

  // ============================================================================
  // LISTAR AVALIAÇÕES
  // ============================================================================

  async findAll(
    tenantId: string,
    query: QueryReviewsDto,
  ): Promise<{ data: ReviewResponse[]; total: number }> {
    const where: any = { tenantId, isVisible: true };

    if (query.providerId) {
      where.providerId = query.providerId;
    }

    if (query.clientId) {
      where.clientId = query.clientId;
    }

    if (query.minRating) {
      where.rating = { ...where.rating, gte: query.minRating };
    }

    if (query.maxRating) {
      where.rating = { ...where.rating, lte: query.maxRating };
    }

    if (query.hasResponse !== undefined) {
      if (query.hasResponse) {
        where.response = { not: null };
      } else {
        where.response = null;
      }
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          provider: { select: { id: true, name: true } },
          appointment: {
            select: {
              id: true,
              date: true,
              service: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit || 20,
        skip: query.offset || 0,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        response: review.response,
        respondedAt: review.respondedAt,
        isVisible: review.isVisible,
        createdAt: review.createdAt,
        client: review.client,
        provider: review.provider,
        service: review.appointment.service,
        appointment: {
          id: review.appointment.id,
          date: review.appointment.date,
        },
      })),
      total,
    };
  }

  // ============================================================================
  // BUSCAR POR ID
  // ============================================================================

  async findById(id: string, tenantId: string): Promise<ReviewResponse> {
    const review = await this.prisma.review.findFirst({
      where: { id, tenantId },
      include: {
        client: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            service: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      response: review.response,
      respondedAt: review.respondedAt,
      isVisible: review.isVisible,
      createdAt: review.createdAt,
      client: review.client,
      provider: review.provider,
      service: review.appointment.service,
      appointment: {
        id: review.appointment.id,
        date: review.appointment.date,
      },
    };
  }

  // ============================================================================
  // RESPONDER AVALIAÇÃO (Admin/Gestor)
  // ============================================================================

  async respond(
    id: string,
    tenantId: string,
    userId: string,
    dto: RespondReviewDto,
  ): Promise<ReviewResponse> {
    const review = await this.prisma.review.findFirst({
      where: { id, tenantId },
    });

    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        response: dto.response,
        respondedAt: new Date(),
        respondedById: userId,
      },
      include: {
        client: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            service: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      id: updated.id,
      rating: updated.rating,
      comment: updated.comment,
      response: updated.response,
      respondedAt: updated.respondedAt,
      isVisible: updated.isVisible,
      createdAt: updated.createdAt,
      client: updated.client,
      provider: updated.provider,
      service: updated.appointment.service,
      appointment: {
        id: updated.appointment.id,
        date: updated.appointment.date,
      },
    };
  }

  // ============================================================================
  // ALTERAR VISIBILIDADE (Admin)
  // ============================================================================

  async updateVisibility(
    id: string,
    tenantId: string,
    isVisible: boolean,
  ): Promise<ReviewResponse> {
    const review = await this.prisma.review.findFirst({
      where: { id, tenantId },
    });

    if (!review) {
      throw new NotFoundException('Avaliação não encontrada');
    }

    const updated = await this.prisma.review.update({
      where: { id },
      data: { isVisible },
      include: {
        client: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            service: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Recalcular estatísticas
    await this.updateProviderStats(review.providerId, tenantId);

    return {
      id: updated.id,
      rating: updated.rating,
      comment: updated.comment,
      response: updated.response,
      respondedAt: updated.respondedAt,
      isVisible: updated.isVisible,
      createdAt: updated.createdAt,
      client: updated.client,
      provider: updated.provider,
      service: updated.appointment.service,
      appointment: {
        id: updated.appointment.id,
        date: updated.appointment.date,
      },
    };
  }

  // ============================================================================
  // ESTATÍSTICAS DO PROVIDER
  // ============================================================================

  async getProviderStats(
    providerId: string,
    tenantId: string,
  ): Promise<ProviderStatsResponse> {
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId },
      include: { stats: true },
    });

    if (!provider) {
      throw new NotFoundException('Profissional não encontrado');
    }

    // Se não existir stats, calcular agora
    if (!provider.stats) {
      await this.updateProviderStats(providerId, tenantId);
      const updatedProvider = await this.prisma.provider.findFirst({
        where: { id: providerId, tenantId },
        include: { stats: true },
      });

      return {
        providerId: provider.id,
        providerName: provider.name,
        totalReviews: updatedProvider?.stats?.totalReviews || 0,
        averageRating: updatedProvider?.stats?.averageRating || 0,
        totalServices: updatedProvider?.stats?.totalServices || 0,
        ratingBreakdown: {
          rating5: updatedProvider?.stats?.rating5Count || 0,
          rating4: updatedProvider?.stats?.rating4Count || 0,
          rating3: updatedProvider?.stats?.rating3Count || 0,
          rating2: updatedProvider?.stats?.rating2Count || 0,
          rating1: updatedProvider?.stats?.rating1Count || 0,
        },
      };
    }

    return {
      providerId: provider.id,
      providerName: provider.name,
      totalReviews: provider.stats.totalReviews,
      averageRating: provider.stats.averageRating,
      totalServices: provider.stats.totalServices,
      ratingBreakdown: {
        rating5: provider.stats.rating5Count,
        rating4: provider.stats.rating4Count,
        rating3: provider.stats.rating3Count,
        rating2: provider.stats.rating2Count,
        rating1: provider.stats.rating1Count,
      },
    };
  }

  // ============================================================================
  // RANKING DE PROFISSIONAIS
  // ============================================================================

  async getProvidersRanking(
    tenantId: string,
    limit = 10,
  ): Promise<ProviderStatsResponse[]> {
    const stats = await this.prisma.providerStats.findMany({
      where: { tenantId, totalReviews: { gt: 0 } },
      include: { provider: { select: { id: true, name: true } } },
      orderBy: [{ averageRating: 'desc' }, { totalReviews: 'desc' }],
      take: limit,
    });

    return stats.map((s) => ({
      providerId: s.provider.id,
      providerName: s.provider.name,
      totalReviews: s.totalReviews,
      averageRating: s.averageRating,
      totalServices: s.totalServices,
      ratingBreakdown: {
        rating5: s.rating5Count,
        rating4: s.rating4Count,
        rating3: s.rating3Count,
        rating2: s.rating2Count,
        rating1: s.rating1Count,
      },
    }));
  }

  // ============================================================================
  // AVALIAÇÕES PENDENTES (Cliente)
  // ============================================================================

  async getPendingReviews(
    clientId: string,
    tenantId: string,
  ): Promise<PendingReviewResponse[]> {
    const appointments = await this.prisma.appointment.findMany({
      where: {
        clientId,
        tenantId,
        status: AppointmentStatus.COMPLETED,
        review: null,
      },
      include: {
        service: { select: { name: true } },
        provider: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 10,
    });

    return appointments.map((a) => ({
      appointmentId: a.id,
      date: a.date,
      serviceName: a.service.name,
      providerName: a.provider.name,
    }));
  }

  // ============================================================================
  // ATUALIZAR ESTATÍSTICAS DO PROVIDER
  // ============================================================================

  private async updateProviderStats(
    providerId: string,
    tenantId: string,
  ): Promise<void> {
    // Calcular estatísticas
    const reviews = await this.prisma.review.findMany({
      where: { providerId, tenantId, isVisible: true },
      select: { rating: true },
    });

    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

    const ratingCounts = {
      rating5Count: reviews.filter((r) => r.rating === 5).length,
      rating4Count: reviews.filter((r) => r.rating === 4).length,
      rating3Count: reviews.filter((r) => r.rating === 3).length,
      rating2Count: reviews.filter((r) => r.rating === 2).length,
      rating1Count: reviews.filter((r) => r.rating === 1).length,
    };

    // Contar total de atendimentos concluídos
    const totalServices = await this.prisma.appointment.count({
      where: {
        providerId,
        tenantId,
        status: AppointmentStatus.COMPLETED,
      },
    });

    // Upsert estatísticas
    await this.prisma.providerStats.upsert({
      where: { providerId },
      update: {
        totalReviews,
        averageRating: Math.round(averageRating * 10) / 10, // 1 casa decimal
        totalServices,
        ...ratingCounts,
      },
      create: {
        providerId,
        tenantId,
        totalReviews,
        averageRating: Math.round(averageRating * 10) / 10,
        totalServices,
        ...ratingCounts,
      },
    });
  }
}
