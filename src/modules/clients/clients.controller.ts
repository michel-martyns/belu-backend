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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PlanLimitGuard } from '../../common/guards/plan.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CheckPlanLimit } from '../../common/decorators/plan-feature.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Clients')
@ApiBearerAuth('access-token')
@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Get()
  @RequirePermissions(Permission.CLIENTS_VIEW)
  async findAll(@CurrentUser() user: CurrentUserData) {
    return this.clientsService.findAll(user.tenantId);
  }

  @Get('search')
  @RequirePermissions(Permission.CLIENTS_VIEW)
  async search(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.clientsService.search(user.tenantId, query || '');
  }

  @Get('trash')
  @RequirePermissions(Permission.CLIENTS_DELETE)
  async findDeleted(@CurrentUser() user: CurrentUserData) {
    return this.clientsService.findDeleted(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions(Permission.CLIENTS_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.clientsService.findById(id, user.tenantId);
  }

  @Get(':id/history')
  @RequirePermissions(Permission.CLIENTS_VIEW)
  async findHistory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.clientsService.findHistory(id, user.tenantId);
  }

  @Post()
  @UseGuards(PlanLimitGuard)
  @RequirePermissions(Permission.CLIENTS_CREATE)
  @CheckPlanLimit('maxClients')
  async create(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.clientsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CLIENTS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.clientsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CLIENTS_DELETE)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.clientsService.delete(id, user.tenantId);
  }

  @Post(':id/restore')
  @RequirePermissions(Permission.CLIENTS_DELETE)
  async restore(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.clientsService.restore(id, user.tenantId);
  }

  @Delete(':id/permanent')
  @RequirePermissions(Permission.CLIENTS_DELETE)
  async hardDelete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.clientsService.hardDelete(id, user.tenantId);
    return { message: 'Cliente excluído permanentemente' };
  }
}
