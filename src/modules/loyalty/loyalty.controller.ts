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
import { LoyaltyService } from './loyalty.service';
import {
  UpdateLoyaltyConfigDto,
  CreateTransactionDto,
  QueryTransactionsDto,
  CreateRedemptionDto,
  UseRedemptionDto,
  QueryRedemptionsDto,
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

@ApiTags('Loyalty')
@Controller('loyalty')
export class LoyaltyController {
  constructor(private loyaltyService: LoyaltyService) {}

  // ============================================================================
  // CONFIGURAÇÃO
  // ============================================================================

  @Get('config')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getConfig(@CurrentUser() user: CurrentUserData) {
    return this.loyaltyService.getConfig(user.tenantId);
  }

  @Patch('config')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.SETTINGS_EDIT)
  async updateConfig(
    @Body() dto: UpdateLoyaltyConfigDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.updateConfig(user.tenantId, dto);
  }

  // ============================================================================
  // ESTATÍSTICAS E LEADERBOARD (ADMIN)
  // ============================================================================

  @Get('stats')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getStats(@CurrentUser() user: CurrentUserData) {
    return this.loyaltyService.getStats(user.tenantId);
  }

  @Get('leaderboard')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getLeaderboard(
    @Query('limit') limit: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.getLeaderboard(user.tenantId, limit || 10);
  }

  // ============================================================================
  // CLIENTES COM PONTOS
  // ============================================================================

  @Get('clients')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getClientsWithPoints(
    @Query('search') search: string,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.getClientsWithPoints(user.tenantId, {
      search,
      limit: limit || 20,
      offset: offset || 0,
    });
  }

  // ============================================================================
  // SALDO E HISTÓRICO DO CLIENTE (ADMIN)
  // ============================================================================

  @Get('balance/:clientId')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getClientBalance(
    @Param('clientId') clientId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.getClientBalance(user.tenantId, clientId);
  }

  @Get('history/:clientId')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getClientHistory(
    @Param('clientId') clientId: string,
    @Query() query: QueryTransactionsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.getClientHistory(user.tenantId, clientId, query);
  }

  // ============================================================================
  // TRANSAÇÕES MANUAIS (ADMIN)
  // ============================================================================

  @Post('transactions')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CLIENTS_EDIT)
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.createTransaction(user.tenantId, dto);
  }

  // ============================================================================
  // RESGATES (ADMIN)
  // ============================================================================

  @Get('redemptions')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async getRedemptions(
    @Query() query: QueryRedemptionsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.getRedemptions(user.tenantId, query);
  }

  @Post('redeem')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CLIENTS_EDIT)
  async redeemPoints(
    @Body() dto: CreateRedemptionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.redeemPoints(user.tenantId, dto);
  }

  @Post('redemptions/:id/use')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.APPOINTMENTS_EDIT)
  async useRedemption(
    @Param('id') id: string,
    @Body() dto: UseRedemptionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.useRedemption(
      user.tenantId,
      id,
      dto.appointmentId,
    );
  }

  @Delete('redemptions/:id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(Permission.CLIENTS_EDIT)
  async cancelRedemption(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.loyaltyService.cancelRedemption(user.tenantId, id);
  }

  // ============================================================================
  // ENDPOINTS PARA CLIENTE (Portal do Cliente)
  // ============================================================================

  @Get('client/config')
  @ApiBearerAuth('client-access-token')
  @UseGuards(ClientJwtAuthGuard)
  async getConfigForClient(@CurrentClient() client: CurrentClientData) {
    return this.loyaltyService.getConfig(client.tenantId);
  }

  @Get('client/balance')
  @ApiBearerAuth('client-access-token')
  @UseGuards(ClientJwtAuthGuard)
  async getMyBalance(@CurrentClient() client: CurrentClientData) {
    return this.loyaltyService.getClientBalance(client.tenantId, client.id);
  }

  @Get('client/history')
  @ApiBearerAuth('client-access-token')
  @UseGuards(ClientJwtAuthGuard)
  async getMyHistory(
    @Query() query: QueryTransactionsDto,
    @CurrentClient() client: CurrentClientData,
  ) {
    return this.loyaltyService.getClientHistory(
      client.tenantId,
      client.id,
      query,
    );
  }

  @Get('client/redemptions')
  @ApiBearerAuth('client-access-token')
  @UseGuards(ClientJwtAuthGuard)
  async getMyRedemptions(
    @Query() query: QueryRedemptionsDto,
    @CurrentClient() client: CurrentClientData,
  ) {
    return this.loyaltyService.getRedemptions(client.tenantId, {
      ...query,
      clientId: client.id,
    });
  }

  @Post('client/redeem')
  @ApiBearerAuth('client-access-token')
  @UseGuards(ClientJwtAuthGuard)
  async redeemMyPoints(
    @Body() dto: { points: number },
    @CurrentClient() client: CurrentClientData,
  ) {
    return this.loyaltyService.redeemPoints(client.tenantId, {
      clientId: client.id,
      points: dto.points,
    });
  }
}
