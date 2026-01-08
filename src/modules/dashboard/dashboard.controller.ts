import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('today')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  async getToday(@CurrentUser() user: CurrentUserData) {
    return this.dashboardService.getToday(user.tenantId);
  }

  @Get('week')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  async getWeek(@CurrentUser() user: CurrentUserData) {
    return this.dashboardService.getWeek(user.tenantId);
  }

  @Get('month')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  async getMonth(@CurrentUser() user: CurrentUserData) {
    return this.dashboardService.getMonth(user.tenantId);
  }

  @Get('overview')
  @RequirePermissions(Permission.DASHBOARD_VIEW)
  async getOverview(@CurrentUser() user: CurrentUserData) {
    return this.dashboardService.getOverview(user.tenantId);
  }
}
