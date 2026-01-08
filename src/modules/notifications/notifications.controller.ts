import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  SendNotificationDto,
  SendBulkNotificationDto,
  SendAppointmentReminderDto,
  ConfigureWhatsAppDto,
  UpdateWhatsAppConfigDto,
  QueryTemplatesDto,
  QueryNotificationsDto,
  WhatsAppWebhookDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ============================================================================
  // TEMPLATES
  // ============================================================================

  @Get('templates')
  @RequirePermissions(Permission.NOTIFICATIONS_VIEW)
  findAllTemplates(@Request() req, @Query() query: QueryTemplatesDto) {
    return this.notificationsService.findAllTemplates(req.user.tenantId, query);
  }

  @Get('templates/:id')
  @RequirePermissions(Permission.NOTIFICATIONS_VIEW)
  findTemplateById(@Request() req, @Param('id') id: string) {
    return this.notificationsService.findTemplateById(id, req.user.tenantId);
  }

  @Post('templates')
  @RequirePermissions(Permission.NOTIFICATIONS_MANAGE)
  createTemplate(@Request() req, @Body() dto: CreateTemplateDto) {
    return this.notificationsService.createTemplate(req.user.tenantId, dto);
  }

  @Patch('templates/:id')
  @RequirePermissions(Permission.NOTIFICATIONS_MANAGE)
  updateTemplate(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.notificationsService.updateTemplate(id, req.user.tenantId, dto);
  }

  @Delete('templates/:id')
  @RequirePermissions(Permission.NOTIFICATIONS_MANAGE)
  deleteTemplate(@Request() req, @Param('id') id: string) {
    return this.notificationsService.deleteTemplate(id, req.user.tenantId);
  }

  @Post('templates/default')
  @RequirePermissions(Permission.NOTIFICATIONS_MANAGE)
  createDefaultTemplates(@Request() req) {
    return this.notificationsService.createDefaultTemplates(req.user.tenantId);
  }

  // ============================================================================
  // NOTIFICATIONS - Envio
  // ============================================================================

  @Post('send')
  @RequirePermissions(Permission.NOTIFICATIONS_SEND)
  sendNotification(@Request() req, @Body() dto: SendNotificationDto) {
    return this.notificationsService.sendNotification(req.user.tenantId, dto);
  }

  @Post('send/bulk')
  @RequirePermissions(Permission.NOTIFICATIONS_SEND)
  sendBulkNotification(@Request() req, @Body() dto: SendBulkNotificationDto) {
    return this.notificationsService.sendBulkNotification(req.user.tenantId, dto);
  }

  @Post('send/appointment-reminder')
  @RequirePermissions(Permission.NOTIFICATIONS_SEND)
  sendAppointmentReminder(
    @Request() req,
    @Body() dto: SendAppointmentReminderDto,
  ) {
    return this.notificationsService.sendAppointmentReminder(
      req.user.tenantId,
      dto,
    );
  }

  @Post('send/appointment-confirmation/:appointmentId')
  @RequirePermissions(Permission.NOTIFICATIONS_SEND)
  sendAppointmentConfirmation(
    @Request() req,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.notificationsService.sendAppointmentConfirmation(
      req.user.tenantId,
      appointmentId,
    );
  }

  // ============================================================================
  // NOTIFICATIONS - Consulta
  // ============================================================================

  @Get()
  @RequirePermissions(Permission.NOTIFICATIONS_VIEW)
  findAllNotifications(@Request() req, @Query() query: QueryNotificationsDto) {
    return this.notificationsService.findAllNotifications(
      req.user.tenantId,
      query,
    );
  }

  @Get('stats')
  @RequirePermissions(Permission.NOTIFICATIONS_VIEW)
  getNotificationStats(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.notificationsService.getNotificationStats(
      req.user.tenantId,
      startDate,
      endDate,
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.NOTIFICATIONS_VIEW)
  findNotificationById(@Request() req, @Param('id') id: string) {
    return this.notificationsService.findNotificationById(id, req.user.tenantId);
  }

  // ============================================================================
  // WHATSAPP CONFIG
  // ============================================================================

  @Get('whatsapp/config')
  @RequirePermissions(Permission.NOTIFICATIONS_MANAGE)
  getWhatsAppConfig(@Request() req) {
    return this.notificationsService.getWhatsAppConfig(req.user.tenantId);
  }

  @Post('whatsapp/config')
  @RequirePermissions(Permission.NOTIFICATIONS_MANAGE)
  configureWhatsApp(@Request() req, @Body() dto: ConfigureWhatsAppDto) {
    return this.notificationsService.configureWhatsApp(req.user.tenantId, dto);
  }

  @Patch('whatsapp/config')
  @RequirePermissions(Permission.NOTIFICATIONS_MANAGE)
  updateWhatsAppConfig(@Request() req, @Body() dto: UpdateWhatsAppConfigDto) {
    return this.notificationsService.updateWhatsAppConfig(
      req.user.tenantId,
      dto,
    );
  }

  @Post('whatsapp/test')
  @RequirePermissions(Permission.NOTIFICATIONS_MANAGE)
  testWhatsAppConnection(@Request() req) {
    return this.notificationsService.testWhatsAppConnection(req.user.tenantId);
  }

  // ============================================================================
  // WEBHOOKS (Público - sem autenticação)
  // ============================================================================
  // TODO: Implementar endpoints de webhook para receber status de entrega
  // Exemplo: POST /notifications/webhook/whatsapp
}
