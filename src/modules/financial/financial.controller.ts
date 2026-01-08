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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FinancialService } from './financial.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
  CreateTransactionDto,
  UpdateTransactionDto,
  PayTransactionDto,
  CreateCommissionConfigDto,
  UpdateCommissionConfigDto,
  PayCommissionDto,
  QueryTransactionsDto,
  QueryCommissionsDto,
  FinancialSummaryDto,
  CreateRecurringExpenseDto,
  UpdateRecurringExpenseDto,
  QueryRecurringExpensesDto,
  DREQueryDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';
import { TransactionType } from '@prisma/client';

@ApiTags('Financial')
@ApiBearerAuth('access-token')
@Controller('financial')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinancialController {
  constructor(private financialService: FinancialService) {}

  // ============================================================================
  // CATEGORIES
  // ============================================================================

  @Get('categories')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findAllCategories(
    @Query('type') type: TransactionType,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findAllCategories(user.tenantId, type);
  }

  @Get('categories/:id')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findCategoryById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findCategoryById(id, user.tenantId);
  }

  @Post('categories')
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  async createCategory(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.createCategory(user.tenantId, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.updateCategory(id, user.tenantId, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.deleteCategory(id, user.tenantId);
  }

  // ============================================================================
  // PAYMENT METHODS
  // ============================================================================

  @Get('payment-methods')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findAllPaymentMethods(@CurrentUser() user: CurrentUserData) {
    return this.financialService.findAllPaymentMethods(user.tenantId);
  }

  @Get('payment-methods/:id')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findPaymentMethodById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findPaymentMethodById(id, user.tenantId);
  }

  @Post('payment-methods')
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  async createPaymentMethod(
    @Body() dto: CreatePaymentMethodDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.createPaymentMethod(user.tenantId, dto);
  }

  @Patch('payment-methods/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async updatePaymentMethod(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentMethodDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.updatePaymentMethod(id, user.tenantId, dto);
  }

  @Delete('payment-methods/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async deletePaymentMethod(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.deletePaymentMethod(id, user.tenantId);
  }

  // ============================================================================
  // TRANSACTIONS
  // ============================================================================

  @Get('transactions')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findAllTransactions(
    @Query() query: QueryTransactionsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findAllTransactions(user.tenantId, query);
  }

  @Get('transactions/:id')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findTransactionById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findTransactionById(id, user.tenantId);
  }

  @Post('transactions')
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.createTransaction(user.tenantId, dto, user.id);
  }

  @Patch('transactions/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async updateTransaction(
    @Param('id') id: string,
    @Body() dto: UpdateTransactionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.updateTransaction(id, user.tenantId, dto);
  }

  @Post('transactions/:id/pay')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async payTransaction(
    @Param('id') id: string,
    @Body() dto: PayTransactionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.payTransaction(id, user.tenantId, dto);
  }

  @Post('transactions/:id/cancel')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async cancelTransaction(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.cancelTransaction(id, user.tenantId);
  }

  @Delete('transactions/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async deleteTransaction(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.deleteTransaction(id, user.tenantId);
  }

  @Post('transactions/from-appointment/:appointmentId')
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  async createFromAppointment(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.createFromAppointment(
      user.tenantId,
      appointmentId,
      user.id,
    );
  }

  // ============================================================================
  // COMMISSIONS
  // ============================================================================

  @Get('commissions')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findAllCommissions(
    @Query() query: QueryCommissionsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findAllCommissions(user.tenantId, query);
  }

  @Post('commissions/:id/pay')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async payCommission(
    @Param('id') id: string,
    @Body() dto: PayCommissionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.payCommission(id, user.tenantId, dto);
  }

  @Post('commissions/pay-multiple')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async payMultipleCommissions(
    @Body() body: { commissionIds: string[]; paidAt?: string },
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.payMultipleCommissions(
      user.tenantId,
      body.commissionIds,
      body.paidAt,
    );
  }

  // ============================================================================
  // COMMISSION CONFIGS
  // ============================================================================

  @Get('commission-configs')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findAllCommissionConfigs(
    @Query('providerId') providerId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findAllCommissionConfigs(user.tenantId, providerId);
  }

  @Post('commission-configs')
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  async createCommissionConfig(
    @Body() dto: CreateCommissionConfigDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.createCommissionConfig(user.tenantId, dto);
  }

  @Patch('commission-configs/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async updateCommissionConfig(
    @Param('id') id: string,
    @Body() dto: UpdateCommissionConfigDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.updateCommissionConfig(id, user.tenantId, dto);
  }

  @Delete('commission-configs/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async deleteCommissionConfig(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.deleteCommissionConfig(id, user.tenantId);
  }

  // ============================================================================
  // SUMMARY & REPORTS
  // ============================================================================

  @Get('summary')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async getFinancialSummary(
    @Query() query: FinancialSummaryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.getFinancialSummary(user.tenantId, query);
  }

  @Get('income-by-category')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async getIncomeByCategory(
    @Query() query: FinancialSummaryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.getIncomeByCategory(user.tenantId, query);
  }

  // ============================================================================
  // RECURRING EXPENSES - Despesas Recorrentes
  // ============================================================================

  @Get('recurring-expenses')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findAllRecurringExpenses(
    @Query() query: QueryRecurringExpensesDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findAllRecurringExpenses(user.tenantId, query);
  }

  @Get('recurring-expenses/:id')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async findRecurringExpenseById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.findRecurringExpenseById(id, user.tenantId);
  }

  @Post('recurring-expenses')
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  async createRecurringExpense(
    @Body() dto: CreateRecurringExpenseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.createRecurringExpense(user.tenantId, dto);
  }

  @Patch('recurring-expenses/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async updateRecurringExpense(
    @Param('id') id: string,
    @Body() dto: UpdateRecurringExpenseDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.updateRecurringExpense(id, user.tenantId, dto);
  }

  @Delete('recurring-expenses/:id')
  @RequirePermissions(Permission.FINANCIAL_EDIT)
  async deleteRecurringExpense(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.deleteRecurringExpense(id, user.tenantId);
  }

  @Post('recurring-expenses/generate')
  @RequirePermissions(Permission.FINANCIAL_CREATE)
  async generateRecurringTransactions(@CurrentUser() user: CurrentUserData) {
    return this.financialService.generateRecurringTransactions(user.tenantId);
  }

  // ============================================================================
  // EXPENSES SUMMARY - Resumo de Despesas
  // ============================================================================

  @Get('expenses-summary')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async getExpensesSummary(
    @Query() query: FinancialSummaryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.getExpensesSummary(user.tenantId, query);
  }

  // ============================================================================
  // DRE - Demonstração do Resultado do Exercício
  // ============================================================================

  @Get('dre')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async getDRE(
    @Query() query: DREQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.getDRE(user.tenantId, query);
  }

  @Get('cash-flow')
  @RequirePermissions(Permission.FINANCIAL_VIEW)
  async getCashFlow(
    @Query() query: DREQueryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.financialService.getCashFlow(user.tenantId, query);
  }
}
