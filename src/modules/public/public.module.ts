import { Module } from '@nestjs/common';
import { PublicService } from './public.service';
import { PublicController } from './public.controller';
import { PageConfigModule } from '../page-config/page-config.module';

@Module({
  imports: [PageConfigModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
