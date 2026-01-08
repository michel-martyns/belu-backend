import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
  Ip,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import {
  CreateWebhookEndpointDto,
  UpdateWebhookEndpointDto,
  QueryWebhookEndpointsDto,
  QueryWebhookLogsDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';

// ============================================================================
// CONTROLLER AUTENTICADO - Gestão de Webhooks
// ============================================================================

@ApiTags('Webhooks')
@ApiBearerAuth('access-token')
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // ============================================================================
  // ENDPOINTS - CRUD
  // ============================================================================

  @Get('endpoints')
  @RequirePermissions(Permission.LEADS_VIEW)
  findAllEndpoints(@Request() req, @Query() query: QueryWebhookEndpointsDto) {
    return this.webhooksService.findAllEndpoints(req.user.tenantId, query);
  }

  @Get('endpoints/:id')
  @RequirePermissions(Permission.LEADS_VIEW)
  findEndpointById(@Request() req, @Param('id') id: string) {
    return this.webhooksService.findEndpointById(id, req.user.tenantId);
  }

  @Post('endpoints')
  @RequirePermissions(Permission.LEADS_CREATE)
  createEndpoint(@Request() req, @Body() dto: CreateWebhookEndpointDto) {
    return this.webhooksService.createEndpoint(req.user.tenantId, dto);
  }

  @Patch('endpoints/:id')
  @RequirePermissions(Permission.LEADS_EDIT)
  updateEndpoint(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookEndpointDto,
  ) {
    return this.webhooksService.updateEndpoint(id, req.user.tenantId, dto);
  }

  @Delete('endpoints/:id')
  @RequirePermissions(Permission.LEADS_EDIT)
  deleteEndpoint(@Request() req, @Param('id') id: string) {
    return this.webhooksService.deleteEndpoint(id, req.user.tenantId);
  }

  @Post('endpoints/:id/regenerate-secret')
  @RequirePermissions(Permission.LEADS_EDIT)
  regenerateSecret(@Request() req, @Param('id') id: string) {
    return this.webhooksService.regenerateSecret(id, req.user.tenantId);
  }

  // ============================================================================
  // LOGS
  // ============================================================================

  @Get('logs')
  @RequirePermissions(Permission.LEADS_VIEW)
  findAllLogs(@Request() req, @Query() query: QueryWebhookLogsDto) {
    return this.webhooksService.findAllLogs(req.user.tenantId, query);
  }

  @Get('logs/:id')
  @RequirePermissions(Permission.LEADS_VIEW)
  findLogById(@Request() req, @Param('id') id: string) {
    return this.webhooksService.findLogById(id, req.user.tenantId);
  }

  @Post('logs/:id/retry')
  @RequirePermissions(Permission.LEADS_EDIT)
  retryLog(@Request() req, @Param('id') id: string) {
    return this.webhooksService.retryLog(id, req.user.tenantId);
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  @Get('stats')
  @RequirePermissions(Permission.LEADS_VIEW)
  getWebhookStats(@Request() req) {
    return this.webhooksService.getWebhookStats(req.user.tenantId);
  }
}

// ============================================================================
// CONTROLLER PÚBLICO - Receber Webhooks
// ============================================================================

@Controller('webhooks/receive')
export class WebhooksPublicController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * Endpoint público para receber webhooks
   * URL: POST /webhooks/receive/:slug
   *
   * Headers opcionais:
   * - X-Webhook-Secret: Chave secreta para validação
   * - X-Webhook-Signature: Assinatura HMAC para validação
   */
  @Post(':slug')
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Param('slug') slug: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-webhook-secret') secretKey?: string,
  ) {
    return this.webhooksService.receiveWebhook(
      slug,
      payload,
      headers,
      ipAddress,
      userAgent,
      secretKey,
    );
  }

  /**
   * Endpoint para verificação de webhook (usado por algumas plataformas)
   * URL: GET /webhooks/receive/:slug
   */
  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  async verifyWebhook(
    @Param('slug') slug: string,
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') verifyToken?: string,
    @Query('hub.challenge') challenge?: string,
  ) {
    // Verificação do Facebook
    if (mode === 'subscribe' && challenge) {
      const endpoint = await this.webhooksService.findEndpointBySlug(slug);
      if (endpoint && verifyToken === endpoint.secretKey) {
        return challenge;
      }
      return { error: 'Verification failed' };
    }

    // Verificação genérica
    return { status: 'ok', slug };
  }

  /**
   * Endpoint específico para Facebook Lead Ads
   */
  @Post(':slug/facebook')
  @HttpCode(HttpStatus.OK)
  async receiveFacebookWebhook(
    @Param('slug') slug: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    // TODO: Validar assinatura do Facebook
    // const isValid = this.webhooksService.validateSignature(
    //   JSON.stringify(payload),
    //   signature,
    //   endpoint.secretKey,
    // );

    return this.webhooksService.receiveWebhook(
      slug,
      payload,
      headers,
      ipAddress,
      userAgent,
    );
  }
}
