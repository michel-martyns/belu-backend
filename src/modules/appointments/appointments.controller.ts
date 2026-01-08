import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateStatusDto,
} from './dto/appointment.dto';
import { AppointmentStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PlanLimitGuard } from '../../common/guards/plan.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CheckPlanLimit } from '../../common/decorators/plan-feature.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Appointments')
@ApiBearerAuth('access-token')
@Controller('appointments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AppointmentsController {
  constructor(private appointmentsService: AppointmentsService) {}

  @Get()
  @RequirePermissions(Permission.APPOINTMENTS_VIEW)
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('date') date?: string,
    @Query('status') status?: AppointmentStatus,
    @Query('providerId') providerId?: string,
  ) {
    return this.appointmentsService.findAll(user.tenantId, {
      date,
      status,
      providerId,
    });
  }

  @Get('available-slots')
  @RequirePermissions(Permission.APPOINTMENTS_VIEW)
  async getAvailableSlots(
    @CurrentUser() user: CurrentUserData,
    @Query('providerId') providerId: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.appointmentsService.getAvailableSlots(
      user.tenantId,
      providerId,
      date,
      serviceId,
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.APPOINTMENTS_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.findById(id, user.tenantId);
  }

  @Post()
  @UseGuards(PlanLimitGuard)
  @RequirePermissions(Permission.APPOINTMENTS_CREATE)
  @CheckPlanLimit('maxAppointmentsPerMonth')
  async create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.APPOINTMENTS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.update(id, user.tenantId, dto);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.APPOINTMENTS_EDIT)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.appointmentsService.updateStatus(id, user.tenantId, dto);
  }
}
