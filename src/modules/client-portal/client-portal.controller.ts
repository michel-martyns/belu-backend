import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientPortalService } from './client-portal.service';
import { ClientJwtAuthGuard } from '../../common/guards/client-jwt-auth.guard';
import { CurrentClient } from '../../common/decorators/current-client.decorator';
import { CancelAppointmentDto, GetAppointmentsQueryDto } from './dto/client-portal.dto';

@Controller('client-portal')
@UseGuards(ClientJwtAuthGuard)
export class ClientPortalController {
  constructor(private readonly clientPortalService: ClientPortalService) {}

  /**
   * Dashboard do cliente
   * GET /client-portal/dashboard
   */
  @Get('dashboard')
  async getDashboard(@CurrentClient() client: any) {
    return this.clientPortalService.getDashboard(client.id, client.tenantId);
  }

  /**
   * Lista agendamentos do cliente
   * GET /client-portal/appointments
   */
  @Get('appointments')
  async getAppointments(
    @CurrentClient() client: any,
    @Query() query: GetAppointmentsQueryDto,
  ) {
    return this.clientPortalService.getAppointments(client.id, client.tenantId, query);
  }

  /**
   * Detalhes de um agendamento
   * GET /client-portal/appointments/:id
   */
  @Get('appointments/:id')
  async getAppointmentById(
    @Param('id') appointmentId: string,
    @CurrentClient() client: any,
  ) {
    return this.clientPortalService.getAppointmentById(
      appointmentId,
      client.id,
      client.tenantId,
    );
  }

  /**
   * Cancela um agendamento
   * POST /client-portal/appointments/:id/cancel
   */
  @Post('appointments/:id/cancel')
  async cancelAppointment(
    @Param('id') appointmentId: string,
    @CurrentClient() client: any,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.clientPortalService.cancelAppointment(
      appointmentId,
      client.id,
      client.tenantId,
      dto.reason,
    );
  }

  /**
   * Lista pacotes do cliente
   * GET /client-portal/packages
   */
  @Get('packages')
  async getPackages(@CurrentClient() client: any) {
    return this.clientPortalService.getPackages(client.id, client.tenantId);
  }

  /**
   * Detalhes de um pacote
   * GET /client-portal/packages/:id
   */
  @Get('packages/:id')
  async getPackageById(
    @Param('id') packageId: string,
    @CurrentClient() client: any,
  ) {
    return this.clientPortalService.getPackageById(
      packageId,
      client.id,
      client.tenantId,
    );
  }

  /**
   * Histórico completo do cliente
   * GET /client-portal/history
   */
  @Get('history')
  async getHistory(@CurrentClient() client: any) {
    return this.clientPortalService.getHistory(client.id, client.tenantId);
  }
}
