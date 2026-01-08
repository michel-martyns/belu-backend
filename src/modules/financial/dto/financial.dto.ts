import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import {
  TransactionType,
  TransactionStatus,
  PaymentMethodType,
  RecurrenceFrequency,
  ExpenseType,
} from '@prisma/client';

// ============================================================================
// DTOs para FinancialCategory
// ============================================================================

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome da categoria é obrigatório' })
  name: string;

  @IsEnum(TransactionType, { message: 'Tipo inválido' })
  type: TransactionType;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  icon?: string;
}

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs para PaymentMethod
// ============================================================================

export class CreatePaymentMethodDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome do método de pagamento é obrigatório' })
  name: string;

  @IsEnum(PaymentMethodType, { message: 'Tipo inválido' })
  type: PaymentMethodType;
}

export class UpdatePaymentMethodDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(PaymentMethodType, { message: 'Tipo inválido' })
  @IsOptional()
  type?: PaymentMethodType;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs para FinancialTransaction
// ============================================================================

export class CreateTransactionDto {
  @IsEnum(TransactionType, { message: 'Tipo de transação inválido' })
  type: TransactionType;

  @IsUUID('4', { message: 'ID da categoria inválido' })
  @IsNotEmpty({ message: 'Categoria é obrigatória' })
  categoryId: string;

  @IsUUID('4', { message: 'ID do método de pagamento inválido' })
  @IsOptional()
  paymentMethodId?: string;

  @IsNumber({}, { message: 'Valor deve ser um número' })
  @Min(0.01, { message: 'Valor deve ser maior que zero' })
  amount: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsDateString({}, { message: 'Data inválida' })
  date: string;

  @IsDateString({}, { message: 'Data de vencimento inválida' })
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsNotEmpty({ message: 'Descrição é obrigatória' })
  description: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsEnum(TransactionStatus, { message: 'Status inválido' })
  @IsOptional()
  status?: TransactionStatus;

  @IsUUID('4', { message: 'ID do agendamento inválido' })
  @IsOptional()
  appointmentId?: string;

  @IsUUID('4', { message: 'ID do cliente inválido' })
  @IsOptional()
  clientId?: string;

  @IsUUID('4', { message: 'ID do profissional inválido' })
  @IsOptional()
  providerId?: string;

  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @IsBoolean()
  @IsOptional()
  generateCommission?: boolean;
}

export class UpdateTransactionDto {
  @IsUUID('4', { message: 'ID da categoria inválido' })
  @IsOptional()
  categoryId?: string;

  @IsUUID('4', { message: 'ID do método de pagamento inválido' })
  @IsOptional()
  paymentMethodId?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsEnum(TransactionStatus, { message: 'Status inválido' })
  @IsOptional()
  status?: TransactionStatus;
}

export class PayTransactionDto {
  @IsDateString({}, { message: 'Data de pagamento inválida' })
  @IsOptional()
  paidAt?: string;

  @IsUUID('4', { message: 'ID do método de pagamento inválido' })
  @IsOptional()
  paymentMethodId?: string;
}

// ============================================================================
// DTOs para Commission
// ============================================================================

export class CreateCommissionConfigDto {
  @IsUUID('4', { message: 'ID do profissional inválido' })
  @IsNotEmpty({ message: 'Profissional é obrigatório' })
  providerId: string;

  @IsUUID('4', { message: 'ID do serviço inválido' })
  @IsOptional()
  serviceId?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number;
}

export class UpdateCommissionConfigDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  percentage?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class PayCommissionDto {
  @IsDateString({}, { message: 'Data de pagamento inválida' })
  @IsOptional()
  paidAt?: string;
}

// ============================================================================
// DTOs de Query/Filtro
// ============================================================================

export class QueryTransactionsDto {
  @IsEnum(TransactionType)
  @IsOptional()
  type?: TransactionType;

  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsUUID('4')
  @IsOptional()
  clientId?: string;

  @IsUUID('4')
  @IsOptional()
  providerId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

export class QueryCommissionsDto {
  @IsUUID('4')
  @IsOptional()
  providerId?: string;

  @IsEnum(['PENDING', 'PAID', 'CANCELLED'])
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

export class FinancialSummaryDto {
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}

// ============================================================================
// DTOs para RecurringExpense (Despesas Recorrentes)
// ============================================================================

export class CreateRecurringExpenseDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome da despesa é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID('4', { message: 'ID da categoria inválido' })
  @IsNotEmpty({ message: 'Categoria é obrigatória' })
  categoryId: string;

  @IsNumber()
  @Min(0.01, { message: 'Valor deve ser maior que zero' })
  amount: number;

  @IsEnum(RecurrenceFrequency, { message: 'Frequência inválida' })
  frequency: RecurrenceFrequency;

  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  dayOfMonth?: number;

  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @IsEnum(ExpenseType, { message: 'Tipo de despesa inválido' })
  @IsOptional()
  expenseType?: ExpenseType;

  @IsDateString({}, { message: 'Data de início inválida' })
  startDate: string;

  @IsDateString({}, { message: 'Data de fim inválida' })
  @IsOptional()
  endDate?: string;
}

export class UpdateRecurringExpenseDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID('4', { message: 'ID da categoria inválido' })
  @IsOptional()
  categoryId?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  amount?: number;

  @IsEnum(RecurrenceFrequency, { message: 'Frequência inválida' })
  @IsOptional()
  frequency?: RecurrenceFrequency;

  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  dayOfMonth?: number;

  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number;

  @IsEnum(ExpenseType, { message: 'Tipo de despesa inválido' })
  @IsOptional()
  expenseType?: ExpenseType;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class QueryRecurringExpensesDto {
  @IsEnum(ExpenseType)
  @IsOptional()
  expenseType?: ExpenseType;

  @IsEnum(RecurrenceFrequency)
  @IsOptional()
  frequency?: RecurrenceFrequency;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================================================
// DTOs para DRE (Demonstração do Resultado do Exercício)
// ============================================================================

export class DREQueryDto {
  @IsDateString()
  @IsNotEmpty({ message: 'Data de início é obrigatória' })
  startDate: string;

  @IsDateString()
  @IsNotEmpty({ message: 'Data de fim é obrigatória' })
  endDate: string;

  @IsEnum(['monthly', 'quarterly', 'yearly'])
  @IsOptional()
  groupBy?: 'monthly' | 'quarterly' | 'yearly';
}
