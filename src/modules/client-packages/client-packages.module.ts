import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ClientPackagesService } from './client-packages.service';
import {
  PackageTemplatesController,
  ClientPackagesController,
  PackageUsagesController,
  ClientPackageBalanceController,
  PackageReportsController,
} from './client-packages.controller';
import { ClientPackagesScheduler } from './client-packages.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [
    PackageTemplatesController,
    ClientPackagesController,
    PackageUsagesController,
    ClientPackageBalanceController,
    PackageReportsController,
  ],
  providers: [ClientPackagesService, ClientPackagesScheduler],
  exports: [ClientPackagesService],
})
export class ClientPackagesModule {}
