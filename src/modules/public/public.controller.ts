import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PublicService } from './public.service';
import { PageConfigService } from '../page-config/page-config.service';
import { CreatePublicAppointmentDto } from './dto/public.dto';

@Controller('public')
export class PublicController {
  constructor(
    private publicService: PublicService,
    private pageConfigService: PageConfigService,
  ) {}

  @Get(':slug')
  async getBusinessBySlug(@Param('slug') slug: string) {
    return this.publicService.getBusinessBySlug(slug);
  }

  @Get(':slug/services')
  async getServicesForBusiness(@Param('slug') slug: string) {
    return this.publicService.getServicesForBusiness(slug);
  }

  @Get(':slug/providers')
  async getProvidersForBusiness(@Param('slug') slug: string) {
    return this.publicService.getProvidersForBusiness(slug);
  }

  @Get(':slug/available-slots')
  async getAvailableSlots(
    @Param('slug') slug: string,
    @Query('providerId') providerId: string,
    @Query('date') date: string,
    @Query('serviceId') serviceId?: string,
  ) {
    return this.publicService.getAvailableSlots(
      slug,
      providerId,
      date,
      serviceId,
    );
  }

  @Post(':slug/appointments')
  async createAppointment(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicAppointmentDto,
  ) {
    return this.publicService.createAppointment(slug, dto);
  }

  @Get(':slug/page-config')
  async getPageConfig(@Param('slug') slug: string) {
    return this.pageConfigService.getPublicConfig(slug);
  }
}
