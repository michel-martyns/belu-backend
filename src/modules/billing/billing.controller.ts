import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  QueryInvoicesDto,
  CreateCouponDto,
  UpdateCouponDto,
  ValidateCouponDto,
  QueryCouponsDto,
  CreateBillingJobDto,
  QueryBillingJobsDto,
  RetryPaymentDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';

// ============================================================================
// Controller Autenticado - Faturas do Tenant
// ============================================================================

@ApiTags('Billing')
@ApiBearerAuth('access-token')
@Controller('billing/invoices')
@UseGuards(JwtAuthGuard)
export class BillingInvoicesController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Listar faturas do tenant
   */
  @Get()
  @RequirePermissions(Permission.SETTINGS_VIEW)
  findTenantInvoices(@Request() req) {
    return this.billingService.findTenantInvoices(req.user.tenantId);
  }

  /**
   * Obter detalhes de uma fatura
   */
  @Get(':id')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  findInvoice(@Param('id') id: string) {
    return this.billingService.findInvoiceById(id);
  }
}

// ============================================================================
// Controller Público - Validação de Cupons
// ============================================================================

@Controller('billing/coupons')
export class BillingCouponsPublicController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Validar cupom de desconto
   */
  @Post('validate')
  validateCoupon(@Body() dto: ValidateCouponDto) {
    return this.billingService.validateCoupon(dto);
  }
}

// ============================================================================
// Controller Admin - Gestão de Billing
// ============================================================================

@Controller('admin/billing')
@UseGuards(JwtAuthGuard)
export class BillingAdminController {
  constructor(private readonly billingService: BillingService) {}

  // ============================================================================
  // Invoices
  // ============================================================================

  /**
   * Listar todas as faturas
   */
  @Get('invoices')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  findAllInvoices(@Query() query: QueryInvoicesDto) {
    return this.billingService.findAllInvoices(query);
  }

  /**
   * Obter detalhes de uma fatura
   */
  @Get('invoices/:id')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  findInvoice(@Param('id') id: string) {
    return this.billingService.findInvoiceById(id);
  }

  /**
   * Criar fatura manual
   */
  @Post('invoices')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(dto);
  }

  /**
   * Atualizar fatura
   */
  @Patch('invoices/:id')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  updateInvoice(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.billingService.updateInvoice(id, dto);
  }

  /**
   * Marcar fatura como paga
   */
  @Post('invoices/:id/mark-paid')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  markAsPaid(@Param('id') id: string) {
    return this.billingService.markInvoiceAsPaid(id);
  }

  /**
   * Anular fatura
   */
  @Post('invoices/:id/void')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  voidInvoice(@Param('id') id: string) {
    return this.billingService.voidInvoice(id);
  }

  /**
   * Processar pagamento de fatura
   */
  @Post('invoices/:id/process-payment')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  processPayment(@Param('id') id: string) {
    return this.billingService.processPayment(id);
  }

  /**
   * Retentar pagamento
   */
  @Post('invoices/retry')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  retryPayment(@Body() dto: RetryPaymentDto) {
    return this.billingService.retryPayment(dto);
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  /**
   * Gerar fatura para assinatura
   */
  @Post('subscriptions/:id/generate-invoice')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  generateInvoice(@Param('id') id: string) {
    return this.billingService.generateSubscriptionInvoice(id);
  }

  /**
   * Renovar assinatura manualmente
   */
  @Post('subscriptions/:id/renew')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  renewSubscription(@Param('id') id: string) {
    return this.billingService.renewSubscription(id);
  }

  // ============================================================================
  // Coupons
  // ============================================================================

  /**
   * Listar cupons
   */
  @Get('coupons')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  findAllCoupons(@Query() query: QueryCouponsDto) {
    return this.billingService.findAllCoupons(query);
  }

  /**
   * Obter cupom por código
   */
  @Get('coupons/:code')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  findCoupon(@Param('code') code: string) {
    return this.billingService.findCouponByCode(code);
  }

  /**
   * Criar cupom
   */
  @Post('coupons')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.billingService.createCoupon(dto);
  }

  /**
   * Atualizar cupom
   */
  @Patch('coupons/:id')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  updateCoupon(@Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.billingService.updateCoupon(id, dto);
  }

  // ============================================================================
  // Billing Jobs
  // ============================================================================

  /**
   * Listar jobs pendentes
   */
  @Get('jobs')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  findJobs(@Query() query: QueryBillingJobsDto) {
    return this.billingService.findPendingJobs(query);
  }

  /**
   * Criar job manualmente
   */
  @Post('jobs')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  createJob(@Body() dto: CreateBillingJobDto) {
    return this.billingService.createBillingJob(dto);
  }

  /**
   * Processar job manualmente
   */
  @Post('jobs/:id/process')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  processJob(@Param('id') id: string) {
    return this.billingService.processJob(id);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Obter estatísticas de billing
   */
  @Get('stats')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  getStats() {
    return this.billingService.getBillingStats();
  }
}
