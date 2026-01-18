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
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import {
  CreateWaitlistDto,
  UpdateWaitlistDto,
  QueryWaitlistDto,
} from './dto';

@ApiTags('Waitlist')
@ApiBearerAuth('access-token')
@Controller('waitlist')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WaitlistController {
  constructor(private waitlistService: WaitlistService) {}

  // ============================================================================
  // CRUD
  // ============================================================================

  @Get()
  @ApiOperation({ summary: 'Lista todas as entradas na lista de espera' })
  @RequirePermissions(Permission.APPOINTMENTS_VIEW)
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() query: QueryWaitlistDto,
  ) {
    return this.waitlistService.findAll(user.tenantId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Retorna estatísticas da lista de espera' })
  @RequirePermissions(Permission.APPOINTMENTS_VIEW)
  async getStats(@CurrentUser() user: CurrentUserData) {
    return this.waitlistService.getStats(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca uma entrada por ID' })
  @RequirePermissions(Permission.APPOINTMENTS_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.waitlistService.findById(id, user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Cria nova entrada na lista de espera' })
  @RequirePermissions(Permission.APPOINTMENTS_CREATE)
  async create(
    @Body() dto: CreateWaitlistDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.waitlistService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza uma entrada na lista de espera' })
  @RequirePermissions(Permission.APPOINTMENTS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWaitlistDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.waitlistService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove uma entrada da lista de espera' })
  @RequirePermissions(Permission.APPOINTMENTS_CANCEL)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.waitlistService.delete(id, user.tenantId);
  }

  // ============================================================================
  // AÇÕES ESPECIAIS
  // ============================================================================

  @Post(':id/notify')
  @ApiOperation({ summary: 'Notifica o cliente de vaga disponível' })
  @RequirePermissions(Permission.APPOINTMENTS_EDIT)
  async notify(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.waitlistService.notify(id, user.tenantId);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Marca entrada como agendada' })
  @RequirePermissions(Permission.APPOINTMENTS_EDIT)
  async markAsScheduled(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.waitlistService.markAsScheduled(id, user.tenantId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela entrada na lista de espera' })
  @RequirePermissions(Permission.APPOINTMENTS_CANCEL)
  async cancel(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.waitlistService.cancel(id, user.tenantId);
  }
}
