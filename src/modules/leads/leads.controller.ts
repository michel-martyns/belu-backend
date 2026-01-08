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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  ChangeStageDto,
  ConvertLeadDto,
  CreateInteractionDto,
  CreateTagDto,
  UpdateTagDto,
  QueryLeadsDto,
  LeadsByStageDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Leads')
@ApiBearerAuth('access-token')
@Controller('leads')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  // ============================================================================
  // LEADS - CRUD
  // ============================================================================

  @Get()
  @RequirePermissions(Permission.LEADS_VIEW)
  async findAll(
    @Query() query: QueryLeadsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.LEADS_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.findById(id, user.tenantId);
  }

  @Post()
  @RequirePermissions(Permission.LEADS_CREATE)
  async create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.create(user.tenantId, dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions(Permission.LEADS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.LEADS_EDIT)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.delete(id, user.tenantId);
  }

  // ============================================================================
  // PIPELINE - Mudança de estágio
  // ============================================================================

  @Patch(':id/stage')
  @RequirePermissions(Permission.LEADS_EDIT)
  async changeStage(
    @Param('id') id: string,
    @Body() dto: ChangeStageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.changeStage(id, user.tenantId, dto, user.id);
  }

  // ============================================================================
  // CONVERSÃO - Lead para Cliente
  // ============================================================================

  @Post(':id/convert')
  @RequirePermissions(Permission.LEADS_CONVERT)
  async convertToClient(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.convertToClient(id, user.tenantId, dto, user.id);
  }

  // ============================================================================
  // INTERAÇÕES - Histórico
  // ============================================================================

  @Get(':id/interactions')
  @RequirePermissions(Permission.LEADS_VIEW)
  async getInteractions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.getInteractions(id, user.tenantId);
  }

  @Post(':id/interactions')
  @RequirePermissions(Permission.LEADS_EDIT)
  async createInteraction(
    @Param('id') id: string,
    @Body() dto: CreateInteractionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.createInteraction(id, user.tenantId, dto, user.id);
  }

  // ============================================================================
  // TAGS
  // ============================================================================

  @Get('tags/all')
  @RequirePermissions(Permission.LEADS_VIEW)
  async findAllTags(@CurrentUser() user: CurrentUserData) {
    return this.leadsService.findAllTags(user.tenantId);
  }

  @Post('tags')
  @RequirePermissions(Permission.LEADS_CREATE)
  async createTag(
    @Body() dto: CreateTagDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.createTag(user.tenantId, dto);
  }

  @Patch('tags/:id')
  @RequirePermissions(Permission.LEADS_EDIT)
  async updateTag(
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.updateTag(id, user.tenantId, dto);
  }

  @Delete('tags/:id')
  @RequirePermissions(Permission.LEADS_EDIT)
  async deleteTag(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.deleteTag(id, user.tenantId);
  }

  // ============================================================================
  // RELATÓRIOS E ESTATÍSTICAS
  // ============================================================================

  @Get('stats/by-stage')
  @RequirePermissions(Permission.LEADS_VIEW)
  async getLeadsByStage(
    @Query() query: LeadsByStageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.getLeadsByStage(user.tenantId, query);
  }

  @Get('stats/by-source')
  @RequirePermissions(Permission.LEADS_VIEW)
  async getLeadsBySource(
    @Query() query: LeadsByStageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.getLeadsBySource(user.tenantId, query);
  }

  @Get('stats/conversion')
  @RequirePermissions(Permission.LEADS_VIEW)
  async getConversionMetrics(
    @Query() query: LeadsByStageDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.leadsService.getConversionMetrics(user.tenantId, query);
  }

  @Get('follow-ups/today')
  @RequirePermissions(Permission.LEADS_VIEW)
  async getFollowUpsToday(@CurrentUser() user: CurrentUserData) {
    return this.leadsService.getFollowUpsToday(user.tenantId);
  }

  @Get('follow-ups/overdue')
  @RequirePermissions(Permission.LEADS_VIEW)
  async getOverdueFollowUps(@CurrentUser() user: CurrentUserData) {
    return this.leadsService.getOverdueFollowUps(user.tenantId);
  }
}
