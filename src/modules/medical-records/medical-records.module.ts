import { Module } from '@nestjs/common';
import { MedicalRecordsController } from './medical-records.controller';
import { MedicalRecordsService } from './medical-records.service';
import { AnamnesisTemplateController } from './anamnesis-template.controller';
import { AnamnesisTemplateService } from './anamnesis-template.service';

@Module({
  controllers: [MedicalRecordsController, AnamnesisTemplateController],
  providers: [MedicalRecordsService, AnamnesisTemplateService],
  exports: [MedicalRecordsService, AnamnesisTemplateService],
})
export class MedicalRecordsModule {}
