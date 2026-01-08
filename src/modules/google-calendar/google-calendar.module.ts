import { Module } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';
import {
  GoogleCalendarController,
  GoogleCalendarOAuthController,
} from './google-calendar.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [GoogleCalendarController, GoogleCalendarOAuthController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
