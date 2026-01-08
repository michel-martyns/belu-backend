import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { EmailModule } from './modules/email/email.module';
import { StorageModule } from './modules/storage/storage.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ServicesModule } from './modules/services/services.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { ClientsModule } from './modules/clients/clients.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BusinessModule } from './modules/business/business.module';
import { PublicModule } from './modules/public/public.module';
import { MedicalRecordsModule } from './modules/medical-records/medical-records.module';
import { FinancialModule } from './modules/financial/financial.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { LeadsModule } from './modules/leads/leads.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { PageConfigModule } from './modules/page-config/page-config.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { GoogleCalendarModule } from './modules/google-calendar/google-calendar.module';
import { PlansModule } from './modules/plans/plans.module';
import { BillingModule } from './modules/billing/billing.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ClientPackagesModule } from './modules/client-packages/client-packages.module';
import { DigitalSignatureModule } from './modules/digital-signature/digital-signature.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { QueuesModule } from './queues/queues.module';
import { AuditModule } from './modules/audit/audit.module';
import { ClientAuthModule } from './modules/client-auth/client-auth.module';
import { ClientPortalModule } from './modules/client-portal/client-portal.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
    PrismaModule,
    RedisModule, // Módulo global de cache Redis
    HealthModule, // Health checks para Docker/K8s
    EmailModule, // Módulo global de email
    StorageModule, // Módulo global de storage (S3/MinIO)
    TenantModule, // Módulo global de tenant
    AuthModule,
    UsersModule,
    ServicesModule,
    ProvidersModule,
    ClientsModule,
    AppointmentsModule,
    DashboardModule,
    BusinessModule,
    PublicModule,
    MedicalRecordsModule,
    FinancialModule,
    InventoryModule,
    LeadsModule,
    MarketingModule,
    PageConfigModule,
    NotificationsModule,
    PaymentsModule,
    WebhooksModule,
    GoogleCalendarModule,
    PlansModule,
    BillingModule,
    LocationsModule,
    ClientPackagesModule,
    DigitalSignatureModule,
    PdfModule,
    QueuesModule, // Sistema de filas BullMQ
    AuditModule, // Sistema de auditoria
    ClientAuthModule, // Autenticação de clientes no portal
    ClientPortalModule, // Portal de autoatendimento do cliente
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
