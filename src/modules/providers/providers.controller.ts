import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProvidersService } from './providers.service';
import {
  CreateProviderDto,
  UpdateProviderDto,
  SetProviderServicesDto,
  SetProviderScheduleDto,
} from './dto/provider.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PlanLimitGuard } from '../../common/guards/plan.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CheckPlanLimit } from '../../common/decorators/plan-feature.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Providers')
@ApiBearerAuth('access-token')
@Controller('providers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProvidersController {
  constructor(private providersService: ProvidersService) {}

  @Get()
  @RequirePermissions(Permission.PROVIDERS_VIEW)
  async findAll(@CurrentUser() user: CurrentUserData) {
    return this.providersService.findAll(user.tenantId);
  }

  @Get('active')
  @RequirePermissions(Permission.PROVIDERS_VIEW)
  async findActive(@CurrentUser() user: CurrentUserData) {
    return this.providersService.findActive(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions(Permission.PROVIDERS_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.providersService.findById(id, user.tenantId);
  }

  @Post()
  @UseGuards(PlanLimitGuard)
  @RequirePermissions(Permission.PROVIDERS_CREATE)
  @CheckPlanLimit('maxProviders')
  async create(
    @Body() dto: CreateProviderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.providersService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.PROVIDERS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.providersService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.PROVIDERS_DELETE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.providersService.delete(id, user.tenantId);
  }

  @Get('trash')
  @RequirePermissions(Permission.PROVIDERS_DELETE)
  async findDeleted(@CurrentUser() user: CurrentUserData) {
    return this.providersService.findDeleted(user.tenantId);
  }

  @Post(':id/restore')
  @RequirePermissions(Permission.PROVIDERS_DELETE)
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.providersService.restore(id, user.tenantId);
  }

  @Delete(':id/permanent')
  @RequirePermissions(Permission.PROVIDERS_DELETE)
  async hardDelete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.providersService.hardDelete(id, user.tenantId);
    return { message: 'Profissional excluído permanentemente' };
  }

  @Put(':id/services')
  @RequirePermissions(Permission.PROVIDERS_EDIT)
  async setServices(
    @Param('id') id: string,
    @Body() dto: SetProviderServicesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.providersService.setServices(id, user.tenantId, dto);
  }

  @Put(':id/schedules')
  @RequirePermissions(Permission.PROVIDERS_EDIT)
  async setSchedules(
    @Param('id') id: string,
    @Body() dto: SetProviderScheduleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.providersService.setSchedules(id, user.tenantId, dto);
  }
}
