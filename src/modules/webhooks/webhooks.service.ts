import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
  QueryWebhookEndpointsDto,
  QueryWebhookLogsDto,
} from './dto';
import {
  WebhookSource,
  WebhookLogStatus,
  LeadSource,
  Prisma,
} from '@prisma/client';
import { randomBytes, createHmac } from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly CACHE_PREFIX = 'webhooks';
  private readonly CACHE_TTL = 300;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  // ============================================================================
  // WEBHOOK ENDPOINTS - CRUD
  // ============================================================================

  async findAllEndpoints(tenantId: string, query?: QueryWebhookEndpointsDto) {
    const where: Prisma.WebhookEndpointWhereInput = { tenantId };

    if (query?.source) {
      where.source = query.source;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.campaignId) {
      where.campaignId = query.campaignId;
    }

    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where,
      include: {
        campaign: {
          select: { id: true, name: true },
        },
        _count: {
          select: { logs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Adicionar URL do webhook a cada endpoint
    const baseUrl = this.config.get('APP_URL') || 'https://api.belu.com.br';
    return endpoints.map((endpoint) => ({
      ...endpoint,
      webhookUrl: `${baseUrl}/webhooks/receive/${endpoint.slug}`,
    }));
  }

  async findEndpointById(id: string, tenantId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId },
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
    });

    if (!endpoint) {
      throw new NotFoundException('Endpoint não encontrado');
    }

    const baseUrl = this.config.get('APP_URL') || 'https://api.belu.com.br';
    return {
      ...endpoint,
      webhookUrl: `${baseUrl}/webhooks/receive/${endpoint.slug}`,
    };
  }

  async findEndpointBySlug(slug: string) {
    // Buscar do cache primeiro
    const cacheKey = `${this.CACHE_PREFIX}:endpoint:${slug}`;
    const cached = await this.redis.get<any>(cacheKey);
    if (cached) {
      return cached;
    }

    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { slug, isActive: true },
    });

    if (endpoint) {
      await this.redis.set(cacheKey, JSON.stringify(endpoint), this.CACHE_TTL);
    }

    return endpoint;
  }

  async createEndpoint(tenantId: string, dto: CreateWebhookEndpointDto) {
    // Verificar se slug já existe
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { tenantId, slug: dto.slug },
    });

    if (existing) {
      throw new BadRequestException('Já existe um endpoint com este slug');
    }

    // Gerar chave secreta
    const secretKey = this.generateSecretKey();

    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId,
        ...dto,
        secretKey,
        fieldMapping: dto.fieldMapping as any,
      },
    });

    const baseUrl = this.config.get('APP_URL') || 'https://api.belu.com.br';
    return {
      ...endpoint,
      webhookUrl: `${baseUrl}/webhooks/receive/${endpoint.slug}`,
    };
  }

  async updateEndpoint(
    id: string,
    tenantId: string,
    dto: UpdateWebhookEndpointDto,
  ) {
    await this.findEndpointById(id, tenantId);

    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...dto,
        fieldMapping: dto.fieldMapping as any,
      },
    });

    // Invalidar cache
    await this.invalidateEndpointCache(updated.slug);

    const baseUrl = this.config.get('APP_URL') || 'https://api.belu.com.br';
    return {
      ...updated,
      webhookUrl: `${baseUrl}/webhooks/receive/${updated.slug}`,
    };
  }

  async deleteEndpoint(id: string, tenantId: string) {
    const endpoint = await this.findEndpointById(id, tenantId);

    await this.prisma.webhookEndpoint.delete({ where: { id } });
    await this.invalidateEndpointCache(endpoint.slug);

    return { message: 'Endpoint excluído com sucesso' };
  }

  async regenerateSecret(id: string, tenantId: string) {
    await this.findEndpointById(id, tenantId);

    const newSecretKey = this.generateSecretKey();

    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { secretKey: newSecretKey },
    });

    await this.invalidateEndpointCache(updated.slug);

    return { secretKey: newSecretKey };
  }

  // ============================================================================
  // WEBHOOK LOGS
  // ============================================================================

  async findAllLogs(tenantId: string, query?: QueryWebhookLogsDto) {
    const where: Prisma.WebhookLogWhereInput = { tenantId };

    if (query?.endpointId) {
      where.endpointId = query.endpointId;
    }

    if (query?.status) {
      where.status = query.status;
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

    const [logs, total] = await Promise.all([
      this.prisma.webhookLog.findMany({
        where,
        include: {
          endpoint: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query?.limit || 50,
        skip: query?.offset || 0,
      }),
      this.prisma.webhookLog.count({ where }),
    ]);

    return {
      data: logs,
      total,
      limit: query?.limit || 50,
      offset: query?.offset || 0,
    };
  }

  async findLogById(id: string, tenantId: string) {
    const log = await this.prisma.webhookLog.findFirst({
      where: { id, tenantId },
      include: {
        endpoint: true,
      },
    });

    if (!log) {
      throw new NotFoundException('Log não encontrado');
    }

    return log;
  }

  async retryLog(id: string, tenantId: string) {
    const log = await this.findLogById(id, tenantId);

    if (log.status === WebhookLogStatus.SUCCESS) {
      throw new BadRequestException('Webhook já processado com sucesso');
    }

    // Reprocessar o webhook
    return this.processWebhook(
      log.endpoint.slug,
      log.payload,
      log.headers as Record<string, string>,
      log.ipAddress || undefined,
      log.userAgent || undefined,
    );
  }

  // ============================================================================
  // RECEBER E PROCESSAR WEBHOOKS (Público)
  // ============================================================================

  async receiveWebhook(
    slug: string,
    payload: any,
    headers: Record<string, string>,
    ipAddress?: string,
    userAgent?: string,
    secretKey?: string,
  ) {
    const endpoint = await this.findEndpointBySlug(slug);

    if (!endpoint) {
      throw new NotFoundException('Endpoint não encontrado');
    }

    // Validar chave secreta (se fornecida no header)
    if (secretKey && secretKey !== endpoint.secretKey) {
      throw new UnauthorizedException('Chave secreta inválida');
    }

    // Criar log do webhook
    const log = await this.prisma.webhookLog.create({
      data: {
        tenantId: endpoint.tenantId,
        endpointId: endpoint.id,
        method: 'POST',
        headers: headers as any,
        payload: payload as any,
        ipAddress,
        userAgent,
        status: WebhookLogStatus.PENDING,
      },
    });

    // Incrementar contador de recebidos
    await this.prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { totalReceived: { increment: 1 } },
    });

    // Processar o webhook de forma assíncrona
    this.processWebhook(slug, payload, headers, ipAddress, userAgent)
      .catch((error) => {
        console.error(`Erro ao processar webhook ${log.id}:`, error);
      });

    return {
      success: true,
      message: 'Webhook recebido com sucesso',
      logId: log.id,
    };
  }

  async processWebhook(
    slug: string,
    payload: any,
    headers: Record<string, string>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const endpoint = await this.findEndpointBySlug(slug);
    if (!endpoint) {
      throw new NotFoundException('Endpoint não encontrado');
    }

    // Buscar o log mais recente para este payload
    const log = await this.prisma.webhookLog.findFirst({
      where: {
        endpointId: endpoint.id,
        status: WebhookLogStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!log) {
      // Criar novo log se não existir
      return this.receiveWebhook(slug, payload, headers, ipAddress, userAgent);
    }

    try {
      // Atualizar status para processando
      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: { status: WebhookLogStatus.PROCESSING },
      });

      // Extrair dados do lead baseado na fonte
      const leadData = await this.extractLeadData(endpoint, payload);

      // Verificar se já existe um lead com este email/telefone
      const existingLead = await this.checkDuplicateLead(
        endpoint.tenantId,
        leadData.email,
        leadData.phone,
        leadData.whatsapp,
      );

      if (existingLead) {
        await this.prisma.webhookLog.update({
          where: { id: log.id },
          data: {
            status: WebhookLogStatus.DUPLICATE,
            processedAt: new Date(),
            leadId: existingLead.id,
            errorMessage: `Lead duplicado: ${existingLead.id}`,
          },
        });

        return { success: false, duplicate: true, existingLeadId: existingLead.id };
      }

      // Criar o lead
      const lead = await this.prisma.lead.create({
        data: {
          tenantId: endpoint.tenantId,
          name: leadData.name || 'Lead sem nome',
          email: leadData.email,
          phone: leadData.phone,
          whatsapp: leadData.whatsapp,
          source: this.mapWebhookSourceToLeadSource(endpoint.source),
          sourceDetail: `Webhook: ${endpoint.name}`,
          stage: endpoint.defaultStage,
          priority: endpoint.defaultPriority,
          assignedToId: endpoint.assignToUserId,
          campaignId: endpoint.campaignId,
          notes: leadData.notes,
        },
      });

      // Aplicar tags automáticas
      if (endpoint.autoTags && endpoint.autoTags.length > 0) {
        const tags = await this.prisma.leadTag.findMany({
          where: {
            id: { in: endpoint.autoTags },
            tenantId: endpoint.tenantId,
          },
        });

        if (tags.length > 0) {
          await this.prisma.lead.update({
            where: { id: lead.id },
            data: {
              tags: {
                connect: tags.map((tag) => ({ id: tag.id })),
              },
            },
          });
        }
      }

      // Criar interação inicial
      await this.prisma.leadInteraction.create({
        data: {
          tenantId: endpoint.tenantId,
          leadId: lead.id,
          type: 'NOTE',
          title: 'Lead capturado via Webhook',
          description: `Lead recebido através do webhook "${endpoint.name}"\n\nPayload original:\n${JSON.stringify(payload, null, 2)}`,
        },
      });

      // Atualizar log com sucesso
      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: WebhookLogStatus.SUCCESS,
          processedAt: new Date(),
          leadId: lead.id,
        },
      });

      // Atualizar contador de processados
      await this.prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { totalProcessed: { increment: 1 } },
      });

      // Enviar notificação se configurado
      if (endpoint.notifyOnReceive && endpoint.notifyEmails.length > 0) {
        // TODO: Integrar com módulo de notificações/email
        console.log(
          `[Webhook] Notificar ${endpoint.notifyEmails.join(', ')} sobre novo lead: ${lead.id}`,
        );
      }

      return { success: true, leadId: lead.id };
    } catch (error) {
      // Atualizar log com erro
      await this.prisma.webhookLog.update({
        where: { id: log.id },
        data: {
          status: WebhookLogStatus.FAILED,
          processedAt: new Date(),
          errorMessage: error.message,
        },
      });

      // Atualizar contador de falhas
      await this.prisma.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { totalFailed: { increment: 1 } },
      });

      throw error;
    }
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  async getWebhookStats(tenantId: string) {
    const [endpoints, logsByStatus, recentLogs] = await Promise.all([
      this.prisma.webhookEndpoint.aggregate({
        where: { tenantId },
        _count: true,
        _sum: {
          totalReceived: true,
          totalProcessed: true,
          totalFailed: true,
        },
      }),
      this.prisma.webhookLog.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.webhookLog.findMany({
        where: { tenantId },
        include: {
          endpoint: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const activeEndpoints = await this.prisma.webhookEndpoint.count({
      where: { tenantId, isActive: true },
    });

    const bySource = await this.prisma.webhookEndpoint.groupBy({
      by: ['source'],
      where: { tenantId },
      _count: true,
    });

    const totalReceived = endpoints._sum.totalReceived || 0;
    const totalProcessed = endpoints._sum.totalProcessed || 0;
    const totalFailed = endpoints._sum.totalFailed || 0;

    return {
      totalEndpoints: endpoints._count,
      activeEndpoints,
      totalReceived,
      totalProcessed,
      totalFailed,
      successRate:
        totalReceived > 0
          ? Number(((totalProcessed / totalReceived) * 100).toFixed(2))
          : 0,
      byStatus: logsByStatus.map((s) => ({
        status: s.status,
        count: s._count,
      })),
      bySource: bySource.map((s) => ({
        source: s.source,
        count: s._count,
      })),
      recentLogs: recentLogs.map((log) => ({
        id: log.id,
        endpointName: log.endpoint.name,
        status: log.status,
        createdAt: log.createdAt,
      })),
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private generateSecretKey(): string {
    return `whk_${randomBytes(24).toString('hex')}`;
  }

  private async invalidateEndpointCache(slug: string) {
    const cacheKey = `${this.CACHE_PREFIX}:endpoint:${slug}`;
    await this.redis.del(cacheKey);
  }

  private async extractLeadData(
    endpoint: { source: WebhookSource; fieldMapping: any },
    payload: any,
  ): Promise<{
    name?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    notes?: string;
  }> {
    // Se tiver mapeamento de campos, usar
    if (endpoint.fieldMapping) {
      const mapping = endpoint.fieldMapping as Record<string, string>;
      return {
        name: this.getNestedValue(payload, mapping.name || 'name') ||
              this.getNestedValue(payload, 'nome'),
        email: this.getNestedValue(payload, mapping.email || 'email'),
        phone: this.getNestedValue(payload, mapping.phone || 'phone') ||
               this.getNestedValue(payload, 'telefone'),
        whatsapp: this.getNestedValue(payload, mapping.whatsapp || 'whatsapp'),
        notes: this.getNestedValue(payload, mapping.message || 'message') ||
               this.getNestedValue(payload, 'mensagem'),
      };
    }

    // Extração baseada na fonte
    switch (endpoint.source) {
      case WebhookSource.FACEBOOK_LEADS:
        return this.extractFacebookLeadData(payload);
      case WebhookSource.TYPEFORM:
        return this.extractTypeformData(payload);
      case WebhookSource.GOOGLE_FORMS:
        return this.extractGoogleFormsData(payload);
      default:
        return this.extractGenericData(payload);
    }
  }

  private extractFacebookLeadData(payload: any): {
    name?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    notes?: string;
  } {
    const fieldData = payload.field_data || payload.entry?.[0]?.changes?.[0]?.value?.field_data;

    if (!fieldData) {
      return this.extractGenericData(payload);
    }

    const getValue = (fieldName: string) => {
      const field = fieldData.find(
        (f: any) =>
          f.name?.toLowerCase().includes(fieldName) ||
          f.name?.toLowerCase() === fieldName,
      );
      return field?.values?.[0];
    };

    return {
      name: getValue('full_name') || getValue('nome') || getValue('name'),
      email: getValue('email'),
      phone: getValue('phone') || getValue('telefone') || getValue('phone_number'),
      whatsapp: getValue('whatsapp'),
      notes: getValue('message') || getValue('mensagem'),
    };
  }

  private extractTypeformData(payload: any): {
    name?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    notes?: string;
  } {
    const answers = payload.form_response?.answers || [];

    const getAnswer = (type: string, title?: string) => {
      const answer = answers.find(
        (a: any) =>
          a.type === type ||
          (title && a.field?.title?.toLowerCase().includes(title)),
      );
      return answer?.text || answer?.email || answer?.phone_number;
    };

    return {
      name: getAnswer('text', 'nome') || getAnswer('text', 'name'),
      email: getAnswer('email'),
      phone: getAnswer('phone_number') || getAnswer('text', 'telefone'),
      whatsapp: getAnswer('text', 'whatsapp'),
      notes: getAnswer('long_text') || getAnswer('text', 'mensagem'),
    };
  }

  private extractGoogleFormsData(payload: any): {
    name?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    notes?: string;
  } {
    // Google Forms envia dados em formato diferente
    const responses = payload.responses || payload.form_response || payload;

    return {
      name: responses.name || responses.nome || responses['Nome completo'],
      email: responses.email || responses['E-mail'] || responses['Email'],
      phone: responses.phone || responses.telefone || responses['Telefone'],
      whatsapp: responses.whatsapp || responses['WhatsApp'],
      notes: responses.message || responses.mensagem || responses['Mensagem'],
    };
  }

  private extractGenericData(payload: any): {
    name?: string;
    email?: string;
    phone?: string;
    whatsapp?: string;
    notes?: string;
  } {
    // Tentar extrair de campos comuns
    const flatPayload = this.flattenObject(payload);

    const findValue = (...keys: string[]) => {
      for (const key of keys) {
        const found = Object.keys(flatPayload).find(
          (k) => k.toLowerCase().includes(key.toLowerCase()),
        );
        if (found && flatPayload[found]) {
          return String(flatPayload[found]);
        }
      }
      return undefined;
    };

    return {
      name: findValue('name', 'nome', 'full_name', 'fullname'),
      email: findValue('email', 'e-mail'),
      phone: findValue('phone', 'telefone', 'tel', 'celular'),
      whatsapp: findValue('whatsapp', 'wpp', 'zap'),
      notes: findValue('message', 'mensagem', 'msg', 'observacao', 'obs'),
    };
  }

  private getNestedValue(obj: any, path: string): any {
    if (!path) return undefined;
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private flattenObject(obj: any, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(result, this.flattenObject(obj[key], newKey));
        } else {
          result[newKey] = obj[key];
        }
      }
    }

    return result;
  }

  private async checkDuplicateLead(
    tenantId: string,
    email?: string,
    phone?: string,
    whatsapp?: string,
  ) {
    if (!email && !phone && !whatsapp) {
      return null;
    }

    const conditions: Prisma.LeadWhereInput[] = [];

    if (email) {
      conditions.push({ email });
    }
    if (phone) {
      conditions.push({ phone });
    }
    if (whatsapp) {
      conditions.push({ whatsapp });
    }

    return this.prisma.lead.findFirst({
      where: {
        tenantId,
        OR: conditions,
      },
    });
  }

  private mapWebhookSourceToLeadSource(source: WebhookSource): LeadSource {
    const mapping: Record<WebhookSource, LeadSource> = {
      [WebhookSource.CUSTOM]: LeadSource.WEBSITE,
      [WebhookSource.FACEBOOK_LEADS]: LeadSource.FACEBOOK,
      [WebhookSource.GOOGLE_FORMS]: LeadSource.WEBSITE,
      [WebhookSource.TYPEFORM]: LeadSource.WEBSITE,
      [WebhookSource.JOTFORM]: LeadSource.WEBSITE,
      [WebhookSource.ELEMENTOR]: LeadSource.WEBSITE,
      [WebhookSource.WORDPRESS]: LeadSource.WEBSITE,
      [WebhookSource.LANDING_PAGE]: LeadSource.WEBSITE,
      [WebhookSource.RD_STATION]: LeadSource.OTHER,
      [WebhookSource.HUBSPOT]: LeadSource.OTHER,
      [WebhookSource.ZAPIER]: LeadSource.OTHER,
      [WebhookSource.OTHER]: LeadSource.OTHER,
    };

    return mapping[source] || LeadSource.OTHER;
  }

  // ============================================================================
  // VALIDAÇÃO DE ASSINATURA (para webhooks seguros)
  // ============================================================================

  validateSignature(
    payload: string,
    signature: string,
    secret: string,
  ): boolean {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return signature === expectedSignature || signature === `sha256=${expectedSignature}`;
  }
}
