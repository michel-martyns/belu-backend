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
import { ReviewsService } from './reviews.service';
import {
  CreateReviewDto,
  RespondReviewDto,
  UpdateReviewVisibilityDto,
  QueryReviewsDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClientJwtAuthGuard } from '../../common/guards/client-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentClient } from '../../common/decorators/current-client.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import type { CurrentClientData } from '../../common/decorators/current-client.decorator';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  // ============================================================================
  // ENDPOINTS PARA ADMIN/GESTOR
  // ============================================================================

  @Get()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: QueryReviewsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.reviewsService.findAll(user.tenantId, query);
  }

  @Get('stats/ranking')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getProvidersRanking(@CurrentUser() user: CurrentUserData) {
    return this.reviewsService.getProvidersRanking(user.tenantId);
  }

  @Get('provider/:providerId/stats')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getProviderStats(
    @Param('providerId') providerId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.reviewsService.getProviderStats(providerId, user.tenantId);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.reviewsService.findById(id, user.tenantId);
  }

  @Post(':id/respond')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CLIENTS_EDIT)
  async respond(
    @Param('id') id: string,
    @Body() dto: RespondReviewDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.reviewsService.respond(id, user.tenantId, user.id, dto);
  }

  @Patch(':id/visibility')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CLIENTS_EDIT)
  async updateVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateReviewVisibilityDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.reviewsService.updateVisibility(id, user.tenantId, dto.isVisible);
  }

  // ============================================================================
  // ENDPOINTS PARA CLIENTE (Portal do Cliente)
  // ============================================================================

  @Post()
  @ApiBearerAuth('client-access-token')
  @UseGuards(ClientJwtAuthGuard)
  async create(
    @Body() dto: CreateReviewDto,
    @CurrentClient() client: CurrentClientData,
  ) {
    return this.reviewsService.create(client.id, client.tenantId, dto);
  }

  @Get('client/pending')
  @ApiBearerAuth('client-access-token')
  @UseGuards(ClientJwtAuthGuard)
  async getPendingReviews(@CurrentClient() client: CurrentClientData) {
    return this.reviewsService.getPendingReviews(client.id, client.tenantId);
  }

  @Get('client/my-reviews')
  @ApiBearerAuth('client-access-token')
  @UseGuards(ClientJwtAuthGuard)
  async getMyReviews(@CurrentClient() client: CurrentClientData) {
    return this.reviewsService.findAll(client.tenantId, {
      clientId: client.id,
    });
  }
}
