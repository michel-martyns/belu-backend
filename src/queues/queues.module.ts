import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueuesService } from './queues.service';
import { QueuesController } from './queues.controller';
import { EmailProcessor } from './processors/email.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { WhatsAppProcessor } from './processors/whatsapp.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../modules/email/email.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    EmailModule,
  ],
  controllers: [QueuesController],
  providers: [
    QueuesService,
    EmailProcessor,
    NotificationProcessor,
    WhatsAppProcessor,
  ],
  exports: [QueuesService],
})
export class QueuesModule {}
