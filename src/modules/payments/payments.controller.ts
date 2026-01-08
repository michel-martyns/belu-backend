import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  ConfigureGatewayDto,
  UpdateGatewayConfigDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  CancelSubscriptionDto,
  CreatePaymentDto,
  RefundPaymentDto,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  CheckoutDto,
  QueryPaymentsDto,
  QueryInvoicesDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';

@ApiTags('Payments')
@ApiBearerAuth('access-token')
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ============================================================================
  // PLAN PRICING (Público - não precisa de autenticação específica do tenant)
  // ============================================================================

  @Get('plans')
  getPlanPricing() {
    return this.paymentsService.getPlanPricing();
  }

  // ============================================================================
  // GATEWAY CONFIG
  // ============================================================================

  @Get('gateway/config')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  getGatewayConfig(@Request() req) {
    return this.paymentsService.getGatewayConfig(req.user.tenantId);
  }

  @Post('gateway/config')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  configureGateway(@Request() req, @Body() dto: ConfigureGatewayDto) {
    return this.paymentsService.configureGateway(req.user.tenantId, dto);
  }

  @Patch('gateway/config')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  updateGatewayConfig(@Request() req, @Body() dto: UpdateGatewayConfigDto) {
    return this.paymentsService.updateGatewayConfig(req.user.tenantId, dto);
  }

  // ============================================================================
  // SUBSCRIPTION
  // ============================================================================

  @Get('subscription')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  getSubscription(@Request() req) {
    return this.paymentsService.getSubscription(req.user.tenantId);
  }

  @Post('subscription')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  createSubscription(@Request() req, @Body() dto: CreateSubscriptionDto) {
    return this.paymentsService.createSubscription(req.user.tenantId, dto);
  }

  @Patch('subscription')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  updateSubscription(@Request() req, @Body() dto: UpdateSubscriptionDto) {
    return this.paymentsService.updateSubscription(req.user.tenantId, dto);
  }

  @Post('subscription/cancel')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  cancelSubscription(@Request() req, @Body() dto: CancelSubscriptionDto) {
    return this.paymentsService.cancelSubscription(req.user.tenantId, dto);
  }

  @Post('subscription/reactivate')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  reactivateSubscription(@Request() req) {
    return this.paymentsService.reactivateSubscription(req.user.tenantId);
  }

  // ============================================================================
  // CHECKOUT (Fluxo completo)
  // ============================================================================

  @Post('checkout')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  checkout(@Request() req, @Body() dto: CheckoutDto) {
    return this.paymentsService.checkout(req.user.tenantId, dto);
  }

  // ============================================================================
  // PAYMENTS
  // ============================================================================

  @Get()
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  findAllPayments(@Request() req, @Query() query: QueryPaymentsDto) {
    return this.paymentsService.findAllPayments(req.user.tenantId, query);
  }

  @Get('stats')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  getPaymentStats(
    @Request() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getPaymentStats(
      req.user.tenantId,
      startDate,
      endDate,
    );
  }

  @Get(':id')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  findPaymentById(@Request() req, @Param('id') id: string) {
    return this.paymentsService.findPaymentById(id, req.user.tenantId);
  }

  @Post()
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  createPayment(@Request() req, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPayment(req.user.tenantId, dto);
  }

  @Post(':id/refund')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  refundPayment(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.paymentsService.refundPayment(id, req.user.tenantId, dto);
  }

  // ============================================================================
  // INVOICES
  // ============================================================================

  @Get('invoices')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  findAllInvoices(@Request() req, @Query() query: QueryInvoicesDto) {
    return this.paymentsService.findAllInvoices(req.user.tenantId, query);
  }

  @Get('invoices/:id')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  findInvoiceById(@Request() req, @Param('id') id: string) {
    return this.paymentsService.findInvoiceById(id, req.user.tenantId);
  }

  @Post('invoices')
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  createInvoice(@Request() req, @Body() dto: CreateInvoiceDto) {
    return this.paymentsService.createInvoice(req.user.tenantId, dto);
  }

  @Patch('invoices/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  updateInvoice(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.paymentsService.updateInvoice(id, req.user.tenantId, dto);
  }

  @Delete('invoices/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  voidInvoice(@Request() req, @Param('id') id: string) {
    return this.paymentsService.voidInvoice(id, req.user.tenantId);
  }
}

// ============================================================================
// WEBHOOKS CONTROLLER (Separado, sem autenticação JWT)
// ============================================================================

@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('stripe')
  async handleStripeWebhook(
    @Body() payload: any,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.paymentsService.handleStripeWebhook(payload, signature);
  }

  @Post('mercadopago')
  async handleMercadoPagoWebhook(@Body() payload: any) {
    return this.paymentsService.handleMercadoPagoWebhook(payload);
  }
}
