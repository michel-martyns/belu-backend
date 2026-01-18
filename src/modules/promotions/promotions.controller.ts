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
import { PromotionsService } from './promotions.service';
import {
  CreatePromotionDto,
  UpdatePromotionDto,
  QueryPromotionsDto,
  CheckPromotionsDto,
  ApplyPromotionDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('promotions')
@UseGuards(JwtAuthGuard)
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Get()
  async findAll(@Request() req, @Query() query: QueryPromotionsDto) {
    return this.promotionsService.findAll(req.user.tenantId, query);
  }

  @Get('stats')
  async getStats(@Request() req) {
    return this.promotionsService.getStats(req.user.tenantId);
  }

  @Get('schedule')
  async getActiveForSchedule(
    @Request() req,
    @Query('date') date: string,
    @Query('serviceId') serviceId?: string,
    @Query('providerId') providerId?: string,
  ) {
    return this.promotionsService.getActiveForSchedule(
      req.user.tenantId,
      date,
      serviceId,
      providerId,
    );
  }

  @Get(':id')
  async findById(@Request() req, @Param('id') id: string) {
    return this.promotionsService.findById(id, req.user.tenantId);
  }

  @Post()
  async create(@Request() req, @Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(req.user.tenantId, dto, req.user.sub);
  }

  @Post('check')
  async checkApplicable(@Request() req, @Body() dto: CheckPromotionsDto) {
    return this.promotionsService.checkApplicable(req.user.tenantId, dto);
  }

  @Post('apply')
  async apply(@Request() req, @Body() dto: ApplyPromotionDto) {
    return this.promotionsService.apply(req.user.tenantId, dto);
  }

  @Patch(':id')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(id, req.user.tenantId, dto);
  }

  @Patch(':id/toggle')
  async toggleActive(@Request() req, @Param('id') id: string) {
    return this.promotionsService.toggleActive(id, req.user.tenantId);
  }

  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    return this.promotionsService.delete(id, req.user.tenantId);
  }
}
