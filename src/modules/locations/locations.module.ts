import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
import {
  LocationsController,
  ProviderLocationsController,
  TransfersController,
  ConsolidatedReportsController,
} from './locations.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    LocationsController,
    ProviderLocationsController,
    TransfersController,
    ConsolidatedReportsController,
  ],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
