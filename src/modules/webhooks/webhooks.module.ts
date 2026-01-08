import { Module } from '@nestjs/common';
import { WebhooksController, WebhooksPublicController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [WebhooksController, WebhooksPublicController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
