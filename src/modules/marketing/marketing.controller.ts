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
import { MarketingService } from './marketing.service';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  UpdateCampaignMetricsDto,
  CreateCampaignExpenseDto,
  CreateSocialPostDto,
  UpdateSocialPostDto,
  UpdatePostMetricsDto,
  QueryCampaignsDto,
  QueryPostsDto,
  MarketingReportDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Marketing')
@ApiBearerAuth('access-token')
@Controller('marketing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MarketingController {
  constructor(private marketingService: MarketingService) {}

  // ============================================================================
  // CAMPAIGNS
  // ============================================================================

  @Get('campaigns')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async findAllCampaigns(
    @Query() query: QueryCampaignsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.findAllCampaigns(user.tenantId, query);
  }

  @Get('campaigns/:id')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async findCampaignById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.findCampaignById(id, user.tenantId);
  }

  @Post('campaigns')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.createCampaign(user.tenantId, dto);
  }

  @Patch('campaigns/:id')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async updateCampaign(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.updateCampaign(id, user.tenantId, dto);
  }

  @Patch('campaigns/:id/metrics')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async updateCampaignMetrics(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignMetricsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.updateCampaignMetrics(id, user.tenantId, dto);
  }

  @Delete('campaigns/:id')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async deleteCampaign(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.deleteCampaign(id, user.tenantId);
  }

  // ============================================================================
  // CAMPAIGN EXPENSES
  // ============================================================================

  @Get('campaigns/:id/expenses')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async getCampaignExpenses(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.getCampaignExpenses(id, user.tenantId);
  }

  @Post('campaigns/:id/expenses')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async addCampaignExpense(
    @Param('id') id: string,
    @Body() dto: CreateCampaignExpenseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.addCampaignExpense(id, user.tenantId, dto);
  }

  // ============================================================================
  // CAMPAIGN TRACKING
  // ============================================================================

  @Get('campaigns/:id/leads')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async getCampaignLeads(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.getCampaignLeads(id, user.tenantId);
  }

  @Get('campaigns/:id/conversions')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async getCampaignConversions(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.getCampaignConversions(id, user.tenantId);
  }

  // ============================================================================
  // SOCIAL POSTS
  // ============================================================================

  @Get('posts')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async findAllPosts(
    @Query() query: QueryPostsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.findAllPosts(user.tenantId, query);
  }

  @Get('posts/calendar')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async getPostsCalendar(
    @Query('month') month: string,
    @Query('year') year: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.getPostsCalendar(
      user.tenantId,
      parseInt(month) || new Date().getMonth() + 1,
      parseInt(year) || new Date().getFullYear(),
    );
  }

  @Get('posts/:id')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async findPostById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.findPostById(id, user.tenantId);
  }

  @Post('posts')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async createPost(
    @Body() dto: CreateSocialPostDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.createPost(user.tenantId, dto, user.id);
  }

  @Patch('posts/:id')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async updatePost(
    @Param('id') id: string,
    @Body() dto: UpdateSocialPostDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.updatePost(id, user.tenantId, dto);
  }

  @Patch('posts/:id/metrics')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async updatePostMetrics(
    @Param('id') id: string,
    @Body() dto: UpdatePostMetricsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.updatePostMetrics(id, user.tenantId, dto);
  }

  @Post('posts/:id/publish')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async markPostAsPublished(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.markPostAsPublished(id, user.tenantId);
  }

  @Delete('posts/:id')
  @RequirePermissions(Permission.MARKETING_MANAGE)
  async deletePost(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.deletePost(id, user.tenantId);
  }

  // ============================================================================
  // REPORTS
  // ============================================================================

  @Get('reports/overview')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async getMarketingOverview(
    @Query() query: MarketingReportDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.getMarketingOverview(user.tenantId, query);
  }

  @Get('reports/roi-by-platform')
  @RequirePermissions(Permission.MARKETING_VIEW)
  async getROIByPlatform(
    @Query() query: MarketingReportDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.marketingService.getROIByPlatform(user.tenantId, query);
  }
}
