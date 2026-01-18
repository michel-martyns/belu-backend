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
import { GiftCardsService } from './gift-cards.service';
import {
  PurchaseGiftCardDto,
  CreateGiftCardDto,
  UpdateGiftCardDto,
  RedeemGiftCardDto,
  RefundGiftCardDto,
  AdjustBalanceDto,
  QueryGiftCardsDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('gift-cards')
@UseGuards(JwtAuthGuard)
export class GiftCardsController {
  constructor(private readonly giftCardsService: GiftCardsService) {}

  @Get()
  async findAll(@Request() req, @Query() query: QueryGiftCardsDto) {
    return this.giftCardsService.findAll(req.user.tenantId, query);
  }

  @Get('stats')
  async getStats(@Request() req) {
    return this.giftCardsService.getStats(req.user.tenantId);
  }

  @Get('validate/:code')
  async validate(@Request() req, @Param('code') code: string) {
    return this.giftCardsService.validate(code, req.user.tenantId);
  }

  @Get(':id')
  async findById(@Request() req, @Param('id') id: string) {
    return this.giftCardsService.findById(id, req.user.tenantId);
  }

  @Get(':id/transactions')
  async getTransactions(
    @Request() req,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.giftCardsService.getTransactions(
      id,
      req.user.tenantId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Post()
  async create(@Request() req, @Body() dto: CreateGiftCardDto) {
    return this.giftCardsService.create(req.user.tenantId, dto, req.user.sub);
  }

  @Post('purchase')
  async purchase(@Request() req, @Body() dto: PurchaseGiftCardDto) {
    // Se for cliente logado, usar o clientId do token
    const clientId = req.user.clientId || undefined;
    return this.giftCardsService.purchase(req.user.tenantId, dto, clientId);
  }

  @Post('redeem')
  async redeem(@Request() req, @Body() dto: RedeemGiftCardDto) {
    return this.giftCardsService.redeem(req.user.tenantId, dto, req.user.sub);
  }

  @Patch(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateGiftCardDto,
  ) {
    return this.giftCardsService.update(id, req.user.tenantId, dto);
  }

  @Post(':id/refund')
  async refund(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: RefundGiftCardDto,
  ) {
    return this.giftCardsService.refund(id, req.user.tenantId, dto, req.user.sub);
  }

  @Post(':id/adjust')
  async adjustBalance(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AdjustBalanceDto,
  ) {
    return this.giftCardsService.adjustBalance(id, req.user.tenantId, dto, req.user.sub);
  }

  @Post(':id/cancel')
  async cancel(@Request() req, @Param('id') id: string) {
    return this.giftCardsService.cancel(id, req.user.tenantId, req.user.sub);
  }

  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    return this.giftCardsService.delete(id, req.user.tenantId);
  }
}
