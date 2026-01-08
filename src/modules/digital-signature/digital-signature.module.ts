import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DigitalSignatureService } from './digital-signature.service';
import {
  SignatureTemplatesController,
  SignatureRequestsController,
  PublicSignatureController,
  VerifySignatureController,
  SignatureReportsController,
} from './digital-signature.controller';
import { DigitalSignatureScheduler } from './digital-signature.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [
    SignatureTemplatesController,
    SignatureRequestsController,
    PublicSignatureController,
    VerifySignatureController,
    SignatureReportsController,
  ],
  providers: [DigitalSignatureService, DigitalSignatureScheduler],
  exports: [DigitalSignatureService],
})
export class DigitalSignatureModule {}
