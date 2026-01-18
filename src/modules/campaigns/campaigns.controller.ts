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
import { CampaignsService } from './campaigns.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  UpdateCampaignStatusDto,
  QueryCampaignsDto,
  PreviewCampaignDto,
  SendCampaignDto,
  CampaignFiltersDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationStatus } from '@prisma/client';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  // ============================================================================
  // CAMPAIGNS - CRUD
  // ============================================================================

  @Get()
  async findAll(@Request() req, @Query() query: QueryCampaignsDto) {
    return this.campaignsService.findAll(req.user.tenantId, query);
  }

  @Get('stats')
  async getDashboardStats(@Request() req) {
    return this.campaignsService.getDashboardStats(req.user.tenantId);
  }

  @Get('templates')
  async getTemplates(@Request() req) {
    return this.campaignsService.getTemplates(req.user.tenantId);
  }

  @Get(':id')
  async findById(@Request() req, @Param('id') id: string) {
    return this.campaignsService.findById(id, req.user.tenantId);
  }

  @Get(':id/stats')
  async getStats(@Request() req, @Param('id') id: string) {
    return this.campaignsService.getStats(id, req.user.tenantId);
  }

  @Get(':id/recipients')
  async getRecipients(
    @Request() req,
    @Param('id') id: string,
    @Query('status') status?: NotificationStatus,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.campaignsService.getRecipients(id, req.user.tenantId, {
      status,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.create(
      req.user.tenantId,
      dto,
      req.user.sub,
    );
  }

  @Post('preview')
  async preview(@Request() req, @Body() dto: PreviewCampaignDto) {
    return this.campaignsService.preview(req.user.tenantId, dto);
  }

  @Post('target-clients')
  async getTargetClients(@Request() req, @Body() filters: CampaignFiltersDto) {
    return this.campaignsService.getTargetClients(req.user.tenantId, filters);
  }

  @Post(':id/send')
  async send(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: SendCampaignDto,
  ) {
    return this.campaignsService.send(id, req.user.tenantId, dto);
  }

  @Patch(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(id, req.user.tenantId, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignStatusDto,
  ) {
    return this.campaignsService.updateStatus(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    return this.campaignsService.delete(id, req.user.tenantId);
  }
}
