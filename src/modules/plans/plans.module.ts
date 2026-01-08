import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import {
  PlansPublicController,
  SubscriptionController,
  PlansAdminController,
} from './plans.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [
    PlansPublicController,
    SubscriptionController,
    PlansAdminController,
  ],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
