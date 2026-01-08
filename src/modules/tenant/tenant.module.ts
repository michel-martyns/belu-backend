import { Module, Global } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Global() // Disponível globalmente para outros módulos
@Module({
  imports: [PrismaModule],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
