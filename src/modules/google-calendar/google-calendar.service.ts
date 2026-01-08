import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  ConfigureGoogleCalendarDto,
  UpdateGoogleCalendarConfigDto,
  UpdateSyncSettingsDto,
  SelectCalendarDto,
  QuerySyncsDto,
  QueryEventsDto,
  CalendarListItemDto,
} from './dto';
import {
  CalendarSyncStatus,
  EventSyncStatus,
  AppointmentStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';

// Interface para representar tokens OAuth
interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

@Injectable()
export class GoogleCalendarService {
  private readonly CACHE_PREFIX = 'gcal';
  private readonly CACHE_TTL = 300;
  private readonly GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private readonly GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ].join(' ');

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  // ============================================================================
  // CONFIGURAÇÃO DO TENANT
  // ============================================================================

  async getConfig(tenantId: string) {
    const config = await this.prisma.googleCalendarConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      return null;
    }

    // Esconder credenciais
    return {
      ...config,
      clientId: config.clientId ? '********' : null,
      clientSecret: config.clientSecret ? '********' : null,
    };
  }

  async configureGoogleCalendar(tenantId: string, dto: ConfigureGoogleCalendarDto) {
    const existing = await this.prisma.googleCalendarConfig.findUnique({
      where: { tenantId },
    });

    if (existing) {
      return this.prisma.googleCalendarConfig.update({
        where: { tenantId },
        data: dto,
      });
    }

    return this.prisma.googleCalendarConfig.create({
      data: {
        tenantId,
        ...dto,
        isActive: true,
      },
    });
  }

  async updateConfig(tenantId: string, dto: UpdateGoogleCalendarConfigDto) {
    const config = await this.prisma.googleCalendarConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      throw new NotFoundException('Configuração não encontrada');
    }

    return this.prisma.googleCalendarConfig.update({
      where: { tenantId },
      data: dto,
    });
  }

  // ============================================================================
  // OAUTH2 - Conexão com Google
  // ============================================================================

  async getAuthUrl(tenantId: string, providerId: string): Promise<{ authUrl: string; state: string }> {
    const config = await this.getFullConfig(tenantId);

    if (!config || !config.clientId || !config.clientSecret) {
      throw new BadRequestException('Google Calendar não configurado');
    }

    // Gerar state para segurança
    const state = randomBytes(16).toString('hex');

    // Salvar state no Redis temporariamente
    await this.redis.set(
      `${this.CACHE_PREFIX}:oauth:${state}`,
      JSON.stringify({ tenantId, providerId }),
      600, // 10 minutos
    );

    const redirectUri = this.getRedirectUri();

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return {
      authUrl: `${this.GOOGLE_OAUTH_URL}?${params.toString()}`,
      state,
    };
  }

  async handleOAuthCallback(code: string, state: string): Promise<{ success: boolean; providerId: string }> {
    // Recuperar dados do state
    const stateData = await this.redis.get<string>(`${this.CACHE_PREFIX}:oauth:${state}`);
    if (!stateData) {
      throw new BadRequestException('Estado inválido ou expirado');
    }

    const { tenantId, providerId } = JSON.parse(stateData);
    await this.redis.del(`${this.CACHE_PREFIX}:oauth:${state}`);

    const config = await this.getFullConfig(tenantId);
    if (!config || !config.clientId || !config.clientSecret) {
      throw new BadRequestException('Configuração não encontrada ou incompleta');
    }

    // Trocar código por tokens
    const tokens = await this.exchangeCodeForTokens(code, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    // Obter informações do usuário
    const userInfo = await this.getUserInfo(tokens.access_token);

    // Criar ou atualizar sync do provider
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await this.prisma.googleCalendarSync.upsert({
      where: { providerId },
      create: {
        tenantId,
        providerId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt,
        scope: tokens.scope,
        googleEmail: userInfo.email,
        googleAccountId: userInfo.id,
        syncStatus: CalendarSyncStatus.CONNECTED,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiresAt,
        scope: tokens.scope,
        googleEmail: userInfo.email,
        googleAccountId: userInfo.id,
        syncStatus: CalendarSyncStatus.CONNECTED,
        lastSyncError: null,
      },
    });

    return { success: true, providerId };
  }

  async disconnectProvider(providerId: string, tenantId: string) {
    const sync = await this.prisma.googleCalendarSync.findFirst({
      where: { providerId, tenantId },
    });

    if (!sync) {
      throw new NotFoundException('Conexão não encontrada');
    }

    // TODO: Revogar token no Google

    await this.prisma.googleCalendarSync.update({
      where: { id: sync.id },
      data: {
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        syncStatus: CalendarSyncStatus.DISCONNECTED,
        googleEmail: null,
        googleAccountId: null,
        calendarId: null,
        calendarName: null,
      },
    });

    return { message: 'Desconectado com sucesso' };
  }

  // ============================================================================
  // CALENDÁRIOS
  // ============================================================================

  async listCalendars(providerId: string, tenantId: string): Promise<CalendarListItemDto[]> {
    const sync = await this.getValidSync(providerId, tenantId);

    const response = await this.makeGoogleRequest(
      sync,
      `${this.GOOGLE_CALENDAR_API}/users/me/calendarList`,
    );

    return response.items.map((cal: any) => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor,
    }));
  }

  async selectCalendar(providerId: string, tenantId: string, dto: SelectCalendarDto) {
    const sync = await this.prisma.googleCalendarSync.findFirst({
      where: { providerId, tenantId },
    });

    if (!sync) {
      throw new NotFoundException('Conexão não encontrada');
    }

    return this.prisma.googleCalendarSync.update({
      where: { id: sync.id },
      data: {
        calendarId: dto.calendarId,
        calendarName: dto.calendarName,
      },
    });
  }

  // ============================================================================
  // SINCRONIZAÇÃO
  // ============================================================================

  async getSyncStatus(providerId: string, tenantId: string) {
    const sync = await this.prisma.googleCalendarSync.findFirst({
      where: { providerId, tenantId },
      include: {
        provider: { select: { id: true, name: true } },
        _count: { select: { events: true } },
      },
    });

    if (!sync) {
      return null;
    }

    const [pendingEvents, failedEvents] = await Promise.all([
      this.prisma.calendarEvent.count({
        where: { syncId: sync.id, syncStatus: EventSyncStatus.PENDING },
      }),
      this.prisma.calendarEvent.count({
        where: { syncId: sync.id, syncStatus: EventSyncStatus.FAILED },
      }),
    ]);

    return {
      providerId: sync.providerId,
      providerName: sync.provider.name,
      isConnected: sync.syncStatus === CalendarSyncStatus.CONNECTED,
      googleEmail: sync.googleEmail,
      calendarName: sync.calendarName,
      calendarId: sync.calendarId,
      lastSyncAt: sync.lastSyncAt,
      syncStatus: sync.syncStatus,
      syncDirection: sync.syncDirection,
      totalEvents: sync._count.events,
      pendingEvents,
      failedEvents,
    };
  }

  async findAllSyncs(tenantId: string, query?: QuerySyncsDto) {
    const where: Prisma.GoogleCalendarSyncWhereInput = { tenantId };

    if (query?.status) {
      where.syncStatus = query.status;
    }

    if (query?.providerId) {
      where.providerId = query.providerId;
    }

    return this.prisma.googleCalendarSync.findMany({
      where,
      include: {
        provider: { select: { id: true, name: true } },
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateSyncSettings(providerId: string, tenantId: string, dto: UpdateSyncSettingsDto) {
    const sync = await this.prisma.googleCalendarSync.findFirst({
      where: { providerId, tenantId },
    });

    if (!sync) {
      throw new NotFoundException('Conexão não encontrada');
    }

    return this.prisma.googleCalendarSync.update({
      where: { id: sync.id },
      data: dto,
    });
  }

  // ============================================================================
  // EVENTOS
  // ============================================================================

  async syncAppointment(appointmentId: string, tenantId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        client: { select: { name: true, phone: true } },
        provider: { select: { id: true, name: true } },
        service: { select: { name: true, duration: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Verificar se o provider tem sync ativo
    const sync = await this.prisma.googleCalendarSync.findFirst({
      where: {
        providerId: appointment.providerId,
        tenantId,
        syncStatus: CalendarSyncStatus.CONNECTED,
        calendarId: { not: null },
      },
    });

    if (!sync) {
      throw new BadRequestException('Provider não tem Google Calendar conectado');
    }

    // Verificar se já existe evento para este agendamento
    const existingEvent = await this.prisma.calendarEvent.findUnique({
      where: { appointmentId },
    });

    // Preparar dados do evento
    const eventData = this.buildEventData(appointment, sync);

    try {
      let googleEventId: string;
      let eventLink: string;

      if (existingEvent) {
        // Atualizar evento existente
        const response = await this.updateGoogleEvent(
          sync,
          existingEvent.googleEventId,
          eventData,
        );
        googleEventId = response.id;
        eventLink = response.htmlLink;
      } else {
        // Criar novo evento
        const response = await this.createGoogleEvent(sync, eventData);
        googleEventId = response.id;
        eventLink = response.htmlLink;
      }

      // Salvar/atualizar no banco
      const event = await this.prisma.calendarEvent.upsert({
        where: { appointmentId },
        create: {
          tenantId,
          syncId: sync.id,
          appointmentId,
          googleEventId,
          googleCalendarId: sync.calendarId!,
          syncStatus: EventSyncStatus.SYNCED,
          lastSyncAt: new Date(),
          eventTitle: eventData.summary,
          eventStart: new Date(eventData.start.dateTime),
          eventEnd: new Date(eventData.end.dateTime),
          eventLink,
        },
        update: {
          syncStatus: EventSyncStatus.SYNCED,
          lastSyncAt: new Date(),
          lastSyncError: null,
          eventTitle: eventData.summary,
          eventStart: new Date(eventData.start.dateTime),
          eventEnd: new Date(eventData.end.dateTime),
          eventLink,
        },
      });

      return event;
    } catch (error) {
      // Registrar erro
      if (existingEvent) {
        await this.prisma.calendarEvent.update({
          where: { id: existingEvent.id },
          data: {
            syncStatus: EventSyncStatus.FAILED,
            lastSyncError: error.message,
          },
        });
      }
      throw error;
    }
  }

  async deleteCalendarEvent(appointmentId: string, tenantId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { appointmentId, tenantId },
      include: { sync: true },
    });

    if (!event) {
      return { message: 'Evento não encontrado no calendário' };
    }

    try {
      await this.deleteGoogleEvent(event.sync, event.googleEventId);

      await this.prisma.calendarEvent.update({
        where: { id: event.id },
        data: { syncStatus: EventSyncStatus.DELETED },
      });

      return { message: 'Evento removido do calendário' };
    } catch (error) {
      throw new BadRequestException(`Erro ao remover evento: ${error.message}`);
    }
  }

  async syncAllAppointments(providerId: string, tenantId: string, startDate?: string, endDate?: string) {
    const sync = await this.getValidSync(providerId, tenantId);

    const where: Prisma.AppointmentWhereInput = {
      tenantId,
      providerId,
    };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    } else {
      // Usar configuração padrão de sync
      const now = new Date();
      const past = new Date(now);
      past.setDate(past.getDate() - sync.syncPastDays);
      const future = new Date(now);
      future.setDate(future.getDate() + sync.syncFutureDays);

      where.date = {
        gte: past,
        lte: future,
      };
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      include: {
        client: { select: { name: true, phone: true } },
        provider: { select: { id: true, name: true } },
        service: { select: { name: true, duration: true } },
        calendarEvent: true,
      },
    });

    const results = {
      total: appointments.length,
      synced: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const appointment of appointments) {
      try {
        await this.syncAppointment(appointment.id, tenantId);
        results.synced++;
      } catch (error) {
        results.failed++;
        results.errors.push(`${appointment.id}: ${error.message}`);
      }
    }

    // Atualizar último sync
    await this.prisma.googleCalendarSync.update({
      where: { id: sync.id },
      data: { lastSyncAt: new Date() },
    });

    return results;
  }

  async findAllEvents(tenantId: string, query?: QueryEventsDto) {
    const where: Prisma.CalendarEventWhereInput = { tenantId };

    if (query?.syncId) {
      where.syncId = query.syncId;
    }

    if (query?.startDate || query?.endDate) {
      where.eventStart = {};
      if (query.startDate) {
        where.eventStart.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.eventStart.lte = new Date(query.endDate + 'T23:59:59.999Z');
      }
    }

    const [events, total] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where,
        include: {
          appointment: {
            include: {
              client: { select: { name: true } },
              service: { select: { name: true } },
            },
          },
          sync: {
            select: { googleEmail: true, calendarName: true },
          },
        },
        orderBy: { eventStart: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.calendarEvent.count({ where }),
    ]);

    return {
      data: events,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getStats(tenantId: string) {
    const [syncs, events, lastSync] = await Promise.all([
      this.prisma.googleCalendarSync.groupBy({
        by: ['syncStatus'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.calendarEvent.groupBy({
        by: ['syncStatus'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.googleCalendarSync.findFirst({
        where: { tenantId, lastSyncAt: { not: null } },
        orderBy: { lastSyncAt: 'desc' },
        select: { lastSyncAt: true },
      }),
    ]);

    const totalSyncs = syncs.reduce((sum, s) => sum + s._count, 0);
    const connectedSyncs = syncs.find(
      (s) => s.syncStatus === CalendarSyncStatus.CONNECTED,
    )?._count || 0;

    const totalEvents = events.reduce((sum, e) => sum + e._count, 0);
    const syncedEvents = events.find(
      (e) => e.syncStatus === EventSyncStatus.SYNCED,
    )?._count || 0;
    const pendingEvents = events.find(
      (e) => e.syncStatus === EventSyncStatus.PENDING,
    )?._count || 0;
    const failedEvents = events.find(
      (e) => e.syncStatus === EventSyncStatus.FAILED,
    )?._count || 0;

    return {
      totalSyncs,
      connectedSyncs,
      disconnectedSyncs: totalSyncs - connectedSyncs,
      totalEvents,
      syncedEvents,
      pendingEvents,
      failedEvents,
      lastSyncAt: lastSync?.lastSyncAt,
    };
  }

  // ============================================================================
  // HELPERS PRIVADOS
  // ============================================================================

  private async getFullConfig(tenantId: string) {
    return this.prisma.googleCalendarConfig.findUnique({
      where: { tenantId },
    });
  }

  private getRedirectUri(): string {
    const baseUrl = this.config.get('APP_URL') || 'https://api.belu.com.br';
    return `${baseUrl}/google-calendar/oauth/callback`;
  }

  private async exchangeCodeForTokens(
    code: string,
    config: { clientId: string; clientSecret: string },
  ): Promise<OAuthTokens> {
    const response = await fetch(this.GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: this.getRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new BadRequestException(`Erro ao obter tokens: ${error.error_description}`);
    }

    return response.json();
  }

  private async refreshAccessToken(sync: {
    id: string;
    refreshToken: string | null;
    tenantId: string;
  }): Promise<string> {
    if (!sync.refreshToken) {
      throw new BadRequestException('Refresh token não disponível');
    }

    const config = await this.getFullConfig(sync.tenantId);
    if (!config || !config.clientId || !config.clientSecret) {
      throw new BadRequestException('Configuração não encontrada');
    }

    const response = await fetch(this.GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: sync.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      await this.prisma.googleCalendarSync.update({
        where: { id: sync.id },
        data: { syncStatus: CalendarSyncStatus.TOKEN_EXPIRED },
      });
      throw new BadRequestException('Token expirado. Reconecte o calendário.');
    }

    const tokens: OAuthTokens = await response.json();

    await this.prisma.googleCalendarSync.update({
      where: { id: sync.id },
      data: {
        accessToken: tokens.access_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    return tokens.access_token;
  }

  private async getUserInfo(accessToken: string): Promise<{ id: string; email: string }> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new BadRequestException('Erro ao obter informações do usuário');
    }

    return response.json();
  }

  private async getValidSync(providerId: string, tenantId: string) {
    const sync = await this.prisma.googleCalendarSync.findFirst({
      where: { providerId, tenantId },
    });

    if (!sync) {
      throw new NotFoundException('Conexão não encontrada');
    }

    if (sync.syncStatus !== CalendarSyncStatus.CONNECTED) {
      throw new BadRequestException('Calendário não conectado');
    }

    if (!sync.calendarId) {
      throw new BadRequestException('Calendário não selecionado');
    }

    return sync;
  }

  private async makeGoogleRequest(
    sync: { id: string; accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null; tenantId: string },
    url: string,
    options: RequestInit = {},
  ) {
    let accessToken = sync.accessToken;

    // Verificar se token expirou
    if (!accessToken || (sync.tokenExpiresAt && sync.tokenExpiresAt < new Date())) {
      accessToken = await this.refreshAccessToken(sync);
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new BadRequestException(
        `Erro na API do Google: ${error.error?.message || response.statusText}`,
      );
    }

    return response.json();
  }

  private buildEventData(
    appointment: {
      id: string;
      date: Date;
      startTime: string;
      endTime: string;
      status: AppointmentStatus;
      notes: string | null;
      client: { name: string; phone: string | null };
      service: { name: string; duration: number };
    },
    sync: { tenantId: string; calendarId: string | null },
  ) {
    const dateStr = appointment.date.toISOString().split('T')[0];
    const startDateTime = new Date(`${dateStr}T${appointment.startTime}:00`);
    const endDateTime = new Date(`${dateStr}T${appointment.endTime}:00`);

    const summary = `${appointment.service.name} - ${appointment.client.name}`;
    let description = `Cliente: ${appointment.client.name}`;
    if (appointment.client.phone) {
      description += `\nTelefone: ${appointment.client.phone}`;
    }
    description += `\nServiço: ${appointment.service.name}`;
    description += `\nDuração: ${appointment.service.duration} minutos`;
    if (appointment.notes) {
      description += `\n\nObservações: ${appointment.notes}`;
    }
    description += `\n\n---\nAgendado via Belu`;

    return {
      summary,
      description,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Sao_Paulo',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };
  }

  private async createGoogleEvent(
    sync: { id: string; accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null; tenantId: string; calendarId: string | null },
    eventData: any,
  ) {
    return this.makeGoogleRequest(
      sync,
      `${this.GOOGLE_CALENDAR_API}/calendars/${sync.calendarId}/events`,
      {
        method: 'POST',
        body: JSON.stringify(eventData),
      },
    );
  }

  private async updateGoogleEvent(
    sync: { id: string; accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null; tenantId: string; calendarId: string | null },
    eventId: string,
    eventData: any,
  ) {
    return this.makeGoogleRequest(
      sync,
      `${this.GOOGLE_CALENDAR_API}/calendars/${sync.calendarId}/events/${eventId}`,
      {
        method: 'PUT',
        body: JSON.stringify(eventData),
      },
    );
  }

  private async deleteGoogleEvent(
    sync: { id: string; accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null; tenantId: string; calendarId: string | null },
    eventId: string,
  ) {
    const accessToken = sync.accessToken || await this.refreshAccessToken(sync);

    const response = await fetch(
      `${this.GOOGLE_CALENDAR_API}/calendars/${sync.calendarId}/events/${eventId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok && response.status !== 404) {
      throw new BadRequestException('Erro ao deletar evento');
    }
  }
}
