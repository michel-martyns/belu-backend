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
  Res,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { GoogleCalendarService } from './google-calendar.service';
import {
  ConfigureGoogleCalendarDto,
  UpdateGoogleCalendarConfigDto,
  UpdateSyncSettingsDto,
  SelectCalendarDto,
  OAuthCallbackDto,
  SyncAppointmentDto,
  SyncRangeDto,
  QuerySyncsDto,
  QueryEventsDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';

@ApiTags('Google Calendar')
@ApiBearerAuth('access-token')
@Controller('google-calendar')
@UseGuards(JwtAuthGuard)
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  // ============================================================================
  // CONFIGURAÇÃO
  // ============================================================================

  @Get('config')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  getConfig(@Request() req) {
    return this.googleCalendarService.getConfig(req.user.tenantId);
  }

  @Post('config')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  configureGoogleCalendar(
    @Request() req,
    @Body() dto: ConfigureGoogleCalendarDto,
  ) {
    return this.googleCalendarService.configureGoogleCalendar(
      req.user.tenantId,
      dto,
    );
  }

  @Patch('config')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  updateConfig(@Request() req, @Body() dto: UpdateGoogleCalendarConfigDto) {
    return this.googleCalendarService.updateConfig(req.user.tenantId, dto);
  }

  // ============================================================================
  // OAUTH2 - Conexão
  // ============================================================================

  @Get('connect/:providerId')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  async getAuthUrl(@Request() req, @Param('providerId') providerId: string) {
    return this.googleCalendarService.getAuthUrl(req.user.tenantId, providerId);
  }

  @Post('disconnect/:providerId')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  disconnectProvider(@Request() req, @Param('providerId') providerId: string) {
    return this.googleCalendarService.disconnectProvider(
      providerId,
      req.user.tenantId,
    );
  }

  // ============================================================================
  // CALENDÁRIOS
  // ============================================================================

  @Get('calendars/:providerId')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  listCalendars(@Request() req, @Param('providerId') providerId: string) {
    return this.googleCalendarService.listCalendars(
      providerId,
      req.user.tenantId,
    );
  }

  @Post('calendars/:providerId/select')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  selectCalendar(
    @Request() req,
    @Param('providerId') providerId: string,
    @Body() dto: SelectCalendarDto,
  ) {
    return this.googleCalendarService.selectCalendar(
      providerId,
      req.user.tenantId,
      dto,
    );
  }

  // ============================================================================
  // SYNCS
  // ============================================================================

  @Get('syncs')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  findAllSyncs(@Request() req, @Query() query: QuerySyncsDto) {
    return this.googleCalendarService.findAllSyncs(req.user.tenantId, query);
  }

  @Get('syncs/:providerId')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  getSyncStatus(@Request() req, @Param('providerId') providerId: string) {
    return this.googleCalendarService.getSyncStatus(
      providerId,
      req.user.tenantId,
    );
  }

  @Patch('syncs/:providerId/settings')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  updateSyncSettings(
    @Request() req,
    @Param('providerId') providerId: string,
    @Body() dto: UpdateSyncSettingsDto,
  ) {
    return this.googleCalendarService.updateSyncSettings(
      providerId,
      req.user.tenantId,
      dto,
    );
  }

  // ============================================================================
  // SINCRONIZAÇÃO DE EVENTOS
  // ============================================================================

  @Post('sync/appointment/:appointmentId')
  @RequirePermissions(Permission.APPOINTMENTS_EDIT)
  syncAppointment(
    @Request() req,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.googleCalendarService.syncAppointment(
      appointmentId,
      req.user.tenantId,
    );
  }

  @Delete('sync/appointment/:appointmentId')
  @RequirePermissions(Permission.APPOINTMENTS_EDIT)
  deleteCalendarEvent(
    @Request() req,
    @Param('appointmentId') appointmentId: string,
  ) {
    return this.googleCalendarService.deleteCalendarEvent(
      appointmentId,
      req.user.tenantId,
    );
  }

  @Post('sync/:providerId/all')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  syncAllAppointments(
    @Request() req,
    @Param('providerId') providerId: string,
    @Body() dto: SyncRangeDto,
  ) {
    return this.googleCalendarService.syncAllAppointments(
      providerId,
      req.user.tenantId,
      dto.startDate,
      dto.endDate,
    );
  }

  // ============================================================================
  // EVENTOS
  // ============================================================================

  @Get('events')
  @RequirePermissions(Permission.APPOINTMENTS_VIEW)
  findAllEvents(@Request() req, @Query() query: QueryEventsDto) {
    return this.googleCalendarService.findAllEvents(req.user.tenantId, query);
  }

  // ============================================================================
  // ESTATÍSTICAS
  // ============================================================================

  @Get('stats')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  getStats(@Request() req) {
    return this.googleCalendarService.getStats(req.user.tenantId);
  }
}

// ============================================================================
// CONTROLLER PÚBLICO - OAuth Callback
// ============================================================================

@Controller('google-calendar/oauth')
export class GoogleCalendarOAuthController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /**
   * Callback do OAuth2 do Google
   * O Google redireciona para cá após o usuário autorizar
   */
  @Get('callback')
  async handleOAuthCallback(
    @Query() query: OAuthCallbackDto,
    @Res() res: Response,
  ) {
    const frontendUrl =
      process.env.FRONTEND_URL || 'https://app.belu.com.br';

    if (query.error) {
      return res.redirect(
        `${frontendUrl}/settings/integrations/google-calendar?error=${query.error}`,
      );
    }

    try {
      const result = await this.googleCalendarService.handleOAuthCallback(
        query.code,
        query.state || '',
      );

      return res.redirect(
        `${frontendUrl}/settings/integrations/google-calendar?success=true&providerId=${result.providerId}`,
      );
    } catch (error) {
      return res.redirect(
        `${frontendUrl}/settings/integrations/google-calendar?error=${encodeURIComponent(error.message)}`,
      );
    }
  }
}
