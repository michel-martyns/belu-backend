import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Services')
@ApiBearerAuth('access-token')
@Controller('services')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  @RequirePermissions(Permission.SERVICES_VIEW)
  async findAll(@CurrentUser() user: CurrentUserData) {
    return this.servicesService.findAll(user.tenantId);
  }

  @Get('active')
  @RequirePermissions(Permission.SERVICES_VIEW)
  async findActive(@CurrentUser() user: CurrentUserData) {
    return this.servicesService.findActive(user.tenantId);
  }

  @Get('trash')
  @RequirePermissions(Permission.SERVICES_DELETE)
  async findDeleted(@CurrentUser() user: CurrentUserData) {
    return this.servicesService.findDeleted(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions(Permission.SERVICES_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.servicesService.findById(id, user.tenantId);
  }

  @Post()
  @RequirePermissions(Permission.SERVICES_CREATE)
  async create(
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.servicesService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.SERVICES_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.servicesService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.SERVICES_DELETE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.servicesService.delete(id, user.tenantId);
  }

  @Post(':id/restore')
  @RequirePermissions(Permission.SERVICES_DELETE)
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.servicesService.restore(id, user.tenantId);
  }

  @Delete(':id/permanent')
  @RequirePermissions(Permission.SERVICES_DELETE)
  async hardDelete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.servicesService.hardDelete(id, user.tenantId);
    return { message: 'Serviço excluído permanentemente' };
  }
}
