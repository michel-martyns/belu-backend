import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingService } from './billing.service';
import {
  BillingInvoicesController,
  BillingCouponsPublicController,
  BillingAdminController,
} from './billing.controller';
import { BillingScheduler } from './billing.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [
    BillingInvoicesController,
    BillingCouponsPublicController,
    BillingAdminController,
  ],
  providers: [BillingService, BillingScheduler],
  exports: [BillingService],
})
export class BillingModule {}
