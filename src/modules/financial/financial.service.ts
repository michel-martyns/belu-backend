import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, CACHE_TTL } from '../../redis';
import { Decimal } from '@prisma/client/runtime/library';
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
import { TransactionType, TransactionStatus, CommissionStatus, ExpenseType } from '@prisma/client';

@Injectable()
export class FinancialService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ============================================================================
  // CATEGORIES - CRUD
  // ============================================================================

  async findAllCategories(tenantId: string, type?: TransactionType) {
    const where: any = { tenantId };
    if (type) where.type = type;

    return this.prisma.financialCategory.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findCategoryById(id: string, tenantId: string) {
    const category = await this.prisma.financialCategory.findFirst({
      where: { id, tenantId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    return category;
  }

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.financialCategory.findFirst({
      where: { tenantId, name: dto.name, type: dto.type },
    });

    if (existing) {
      throw new ConflictException('Já existe uma categoria com este nome');
    }

    return this.prisma.financialCategory.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        color: dto.color,
        icon: dto.icon,
      },
    });
  }

  async updateCategory(id: string, tenantId: string, dto: UpdateCategoryDto) {
    const category = await this.findCategoryById(id, tenantId);

    if (category.isSystem) {
      throw new BadRequestException('Categorias do sistema não podem ser editadas');
    }

    return this.prisma.financialCategory.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCategory(id: string, tenantId: string) {
    const category = await this.findCategoryById(id, tenantId);

    if (category.isSystem) {
      throw new BadRequestException('Categorias do sistema não podem ser excluídas');
    }

    const transactionsCount = await this.prisma.financialTransaction.count({
      where: { categoryId: id },
    });

    if (transactionsCount > 0) {
      throw new ConflictException(
        'Não é possível excluir uma categoria com transações vinculadas',
      );
    }

    await this.prisma.financialCategory.delete({ where: { id } });
    return { message: 'Categoria removida com sucesso' };
  }

  // ============================================================================
  // PAYMENT METHODS - CRUD
  // ============================================================================

  async findAllPaymentMethods(tenantId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findPaymentMethodById(id: string, tenantId: string) {
    const method = await this.prisma.paymentMethod.findFirst({
      where: { id, tenantId },
    });

    if (!method) {
      throw new NotFoundException('Método de pagamento não encontrado');
    }

    return method;
  }

  async createPaymentMethod(tenantId: string, dto: CreatePaymentMethodDto) {
    const existing = await this.prisma.paymentMethod.findFirst({
      where: { tenantId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Já existe um método de pagamento com este nome');
    }

    return this.prisma.paymentMethod.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
      },
    });
  }

  async updatePaymentMethod(id: string, tenantId: string, dto: UpdatePaymentMethodDto) {
    await this.findPaymentMethodById(id, tenantId);

    return this.prisma.paymentMethod.update({
      where: { id },
      data: dto,
    });
  }

  async deletePaymentMethod(id: string, tenantId: string) {
    await this.findPaymentMethodById(id, tenantId);

    const transactionsCount = await this.prisma.financialTransaction.count({
      where: { paymentMethodId: id },
    });

    if (transactionsCount > 0) {
      throw new ConflictException(
        'Não é possível excluir um método de pagamento com transações vinculadas',
      );
    }

    await this.prisma.paymentMethod.delete({ where: { id } });
    return { message: 'Método de pagamento removido com sucesso' };
  }

  // ============================================================================
  // TRANSACTIONS - CRUD
  // ============================================================================

  async findAllTransactions(tenantId: string, query?: QueryTransactionsDto) {
    const where: any = { tenantId };

    if (query?.type) where.type = query.type;
    if (query?.categoryId) where.categoryId = query.categoryId;
    if (query?.status) where.status = query.status;
    if (query?.clientId) where.clientId = query.clientId;
    if (query?.providerId) where.providerId = query.providerId;

    if (query?.startDate || query?.endDate) {
      where.date = {};
      if (query.startDate) where.date.gte = new Date(query.startDate);
      if (query.endDate) where.date.lte = new Date(query.endDate);
    }

    return this.prisma.financialTransaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        paymentMethod: { select: { id: true, name: true, type: true } },
        client: { select: { id: true, name: true } },
        provider: { select: { id: true, name: true } },
        appointment: { select: { id: true, date: true, startTime: true } },
        _count: { select: { commissions: true } },
      },
      orderBy: { date: 'desc' },
      take: query?.limit || 50,
      skip: query?.offset || 0,
    });
  }

  async findTransactionById(id: string, tenantId: string) {
    const transaction = await this.prisma.financialTransaction.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        paymentMethod: true,
        client: { select: { id: true, name: true, phone: true } },
        provider: { select: { id: true, name: true } },
        appointment: {
          select: {
            id: true,
            date: true,
            startTime: true,
            service: { select: { id: true, name: true } },
          },
        },
        commissions: {
          include: {
            provider: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transação não encontrada');
    }

    return transaction;
  }

  async createTransaction(
    tenantId: string,
    dto: CreateTransactionDto,
    createdBy?: string,
  ) {
    // Valida categoria
    const category = await this.prisma.financialCategory.findFirst({
      where: { id: dto.categoryId, tenantId },
    });

    if (!category) {
      throw new NotFoundException('Categoria não encontrada');
    }

    if (category.type !== dto.type) {
      throw new BadRequestException(
        'O tipo da transação deve corresponder ao tipo da categoria',
      );
    }

    // Valida método de pagamento se informado
    if (dto.paymentMethodId) {
      const method = await this.prisma.paymentMethod.findFirst({
        where: { id: dto.paymentMethodId, tenantId },
      });
      if (!method) {
        throw new NotFoundException('Método de pagamento não encontrado');
      }
    }

    // Calcula valor líquido
    const amount = new Decimal(dto.amount);
    const discount = dto.discount ? new Decimal(dto.discount) : new Decimal(0);
    const netAmount = amount.minus(discount);

    const transaction = await this.prisma.financialTransaction.create({
      data: {
        tenantId,
        type: dto.type,
        categoryId: dto.categoryId,
        paymentMethodId: dto.paymentMethodId,
        amount,
        discount,
        netAmount,
        date: new Date(dto.date),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        description: dto.description,
        notes: dto.notes,
        reference: dto.reference,
        status: dto.status || TransactionStatus.PENDING,
        appointmentId: dto.appointmentId,
        clientId: dto.clientId,
        providerId: dto.providerId,
        isRecurring: dto.isRecurring || false,
        createdBy,
        paidAt: dto.status === TransactionStatus.PAID ? new Date() : null,
      },
      include: {
        category: { select: { id: true, name: true } },
        paymentMethod: { select: { id: true, name: true } },
      },
    });

    // Gera comissão se solicitado e se for receita
    if (dto.generateCommission && dto.type === TransactionType.INCOME && dto.providerId) {
      await this.generateCommission(tenantId, transaction.id, dto.providerId, netAmount);
    }

    // Invalida cache do dashboard
    await this.redis.invalidateDashboard(tenantId);

    return transaction;
  }

  async updateTransaction(id: string, tenantId: string, dto: UpdateTransactionDto) {
    const transaction = await this.findTransactionById(id, tenantId);

    if (transaction.status === TransactionStatus.PAID) {
      throw new BadRequestException('Transações pagas não podem ser editadas');
    }

    // Recalcula valor líquido se necessário
    let netAmount = transaction.netAmount;
    if (dto.amount !== undefined || dto.discount !== undefined) {
      const amount = dto.amount !== undefined ? new Decimal(dto.amount) : transaction.amount;
      const discount = dto.discount !== undefined ? new Decimal(dto.discount) : (transaction.discount || new Decimal(0));
      netAmount = amount.minus(discount);
    }

    const updated = await this.prisma.financialTransaction.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        netAmount,
      },
      include: {
        category: { select: { id: true, name: true } },
        paymentMethod: { select: { id: true, name: true } },
      },
    });

    await this.redis.invalidateDashboard(tenantId);
    return updated;
  }

  async payTransaction(id: string, tenantId: string, dto: PayTransactionDto) {
    const transaction = await this.findTransactionById(id, tenantId);

    if (transaction.status === TransactionStatus.PAID) {
      throw new BadRequestException('Transação já está paga');
    }

    if (transaction.status === TransactionStatus.CANCELLED) {
      throw new BadRequestException('Transação cancelada não pode ser paga');
    }

    const updated = await this.prisma.financialTransaction.update({
      where: { id },
      data: {
        status: TransactionStatus.PAID,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        paymentMethodId: dto.paymentMethodId || transaction.paymentMethodId,
      },
      include: {
        category: { select: { id: true, name: true } },
        paymentMethod: { select: { id: true, name: true } },
      },
    });

    await this.redis.invalidateDashboard(tenantId);
    return updated;
  }

  async cancelTransaction(id: string, tenantId: string) {
    const transaction = await this.findTransactionById(id, tenantId);

    if (transaction.status === TransactionStatus.PAID) {
      throw new BadRequestException('Transações pagas não podem ser canceladas');
    }

    // Cancela comissões associadas
    await this.prisma.commission.updateMany({
      where: { transactionId: id, status: CommissionStatus.PENDING },
      data: { status: CommissionStatus.CANCELLED },
    });

    const updated = await this.prisma.financialTransaction.update({
      where: { id },
      data: { status: TransactionStatus.CANCELLED },
    });

    await this.redis.invalidateDashboard(tenantId);
    return updated;
  }

  async deleteTransaction(id: string, tenantId: string) {
    const transaction = await this.findTransactionById(id, tenantId);

    if (transaction.status === TransactionStatus.PAID) {
      throw new BadRequestException('Transações pagas não podem ser excluídas');
    }

    await this.prisma.financialTransaction.delete({ where: { id } });
    await this.redis.invalidateDashboard(tenantId);

    return { message: 'Transação removida com sucesso' };
  }

  // ============================================================================
  // COMMISSIONS
  // ============================================================================

  async findAllCommissions(tenantId: string, query?: QueryCommissionsDto) {
    const where: any = { tenantId };

    if (query?.providerId) where.providerId = query.providerId;
    if (query?.status) where.status = query.status;

    if (query?.startDate || query?.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    return this.prisma.commission.findMany({
      where,
      include: {
        provider: { select: { id: true, name: true } },
        transaction: {
          select: {
            id: true,
            description: true,
            date: true,
            netAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async payCommission(id: string, tenantId: string, dto: PayCommissionDto) {
    const commission = await this.prisma.commission.findFirst({
      where: { id, tenantId },
    });

    if (!commission) {
      throw new NotFoundException('Comissão não encontrada');
    }

    if (commission.status === CommissionStatus.PAID) {
      throw new BadRequestException('Comissão já está paga');
    }

    return this.prisma.commission.update({
      where: { id },
      data: {
        status: CommissionStatus.PAID,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      },
    });
  }

  async payMultipleCommissions(tenantId: string, commissionIds: string[], paidAt?: string) {
    const result = await this.prisma.commission.updateMany({
      where: {
        id: { in: commissionIds },
        tenantId,
        status: CommissionStatus.PENDING,
      },
      data: {
        status: CommissionStatus.PAID,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
      },
    });

    return { count: result.count, message: `${result.count} comissões pagas` };
  }

  // ============================================================================
  // COMMISSION CONFIG
  // ============================================================================

  async findAllCommissionConfigs(tenantId: string, providerId?: string) {
    const where: any = { tenantId };
    if (providerId) where.providerId = providerId;

    return this.prisma.providerCommissionConfig.findMany({
      where,
      include: {
        provider: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
      orderBy: [{ providerId: 'asc' }, { serviceId: 'asc' }],
    });
  }

  async createCommissionConfig(tenantId: string, dto: CreateCommissionConfigDto) {
    // Verifica se já existe config para este provider/service
    const existing = await this.prisma.providerCommissionConfig.findFirst({
      where: {
        providerId: dto.providerId,
        serviceId: dto.serviceId || null,
      },
    });

    if (existing) {
      throw new ConflictException('Já existe uma configuração de comissão para este profissional/serviço');
    }

    return this.prisma.providerCommissionConfig.create({
      data: {
        tenantId,
        providerId: dto.providerId,
        serviceId: dto.serviceId,
        percentage: new Decimal(dto.percentage),
      },
      include: {
        provider: { select: { id: true, name: true } },
        service: { select: { id: true, name: true } },
      },
    });
  }

  async updateCommissionConfig(id: string, tenantId: string, dto: UpdateCommissionConfigDto) {
    const config = await this.prisma.providerCommissionConfig.findFirst({
      where: { id, tenantId },
    });

    if (!config) {
      throw new NotFoundException('Configuração de comissão não encontrada');
    }

    return this.prisma.providerCommissionConfig.update({
      where: { id },
      data: {
        percentage: dto.percentage !== undefined ? new Decimal(dto.percentage) : undefined,
        isActive: dto.isActive,
      },
    });
  }

  async deleteCommissionConfig(id: string, tenantId: string) {
    const config = await this.prisma.providerCommissionConfig.findFirst({
      where: { id, tenantId },
    });

    if (!config) {
      throw new NotFoundException('Configuração de comissão não encontrada');
    }

    await this.prisma.providerCommissionConfig.delete({ where: { id } });
    return { message: 'Configuração de comissão removida' };
  }

  // ============================================================================
  // FINANCIAL SUMMARY
  // ============================================================================

  async getFinancialSummary(tenantId: string, query?: FinancialSummaryDto) {
    const startDate = query?.startDate ? new Date(query.startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = query?.endDate ? new Date(query.endDate) : new Date();

    const where = {
      tenantId,
      date: { gte: startDate, lte: endDate },
      status: { not: TransactionStatus.CANCELLED },
    };

    // Receitas
    const incomeResult = await this.prisma.financialTransaction.aggregate({
      where: { ...where, type: TransactionType.INCOME, status: TransactionStatus.PAID },
      _sum: { netAmount: true },
      _count: true,
    });

    // Despesas
    const expenseResult = await this.prisma.financialTransaction.aggregate({
      where: { ...where, type: TransactionType.EXPENSE, status: TransactionStatus.PAID },
      _sum: { netAmount: true },
      _count: true,
    });

    // A receber
    const receivableResult = await this.prisma.financialTransaction.aggregate({
      where: { ...where, type: TransactionType.INCOME, status: TransactionStatus.PENDING },
      _sum: { netAmount: true },
      _count: true,
    });

    // A pagar
    const payableResult = await this.prisma.financialTransaction.aggregate({
      where: { ...where, type: TransactionType.EXPENSE, status: TransactionStatus.PENDING },
      _sum: { netAmount: true },
      _count: true,
    });

    // Comissões pendentes
    const pendingCommissions = await this.prisma.commission.aggregate({
      where: { tenantId, status: CommissionStatus.PENDING },
      _sum: { amount: true },
      _count: true,
    });

    const income = incomeResult._sum.netAmount?.toNumber() || 0;
    const expense = expenseResult._sum.netAmount?.toNumber() || 0;
    const receivable = receivableResult._sum.netAmount?.toNumber() || 0;
    const payable = payableResult._sum.netAmount?.toNumber() || 0;

    return {
      period: { startDate, endDate },
      income: {
        total: income,
        count: incomeResult._count,
      },
      expense: {
        total: expense,
        count: expenseResult._count,
      },
      balance: income - expense,
      receivable: {
        total: receivable,
        count: receivableResult._count,
      },
      payable: {
        total: payable,
        count: payableResult._count,
      },
      projectedBalance: income - expense + receivable - payable,
      pendingCommissions: {
        total: pendingCommissions._sum.amount?.toNumber() || 0,
        count: pendingCommissions._count,
      },
    };
  }

  async getIncomeByCategory(tenantId: string, query?: FinancialSummaryDto) {
    const startDate = query?.startDate ? new Date(query.startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = query?.endDate ? new Date(query.endDate) : new Date();

    const result = await this.prisma.financialTransaction.groupBy({
      by: ['categoryId'],
      where: {
        tenantId,
        type: TransactionType.INCOME,
        status: TransactionStatus.PAID,
        date: { gte: startDate, lte: endDate },
      },
      _sum: { netAmount: true },
      _count: true,
    });

    // Busca nomes das categorias
    const categoryIds = result.map((r) => r.categoryId);
    const categories = await this.prisma.financialCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, color: true },
    });

    return result.map((r) => {
      const category = categories.find((c) => c.id === r.categoryId);
      return {
        categoryId: r.categoryId,
        categoryName: category?.name || 'Desconhecida',
        color: category?.color,
        total: r._sum.netAmount?.toNumber() || 0,
        count: r._count,
      };
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async generateCommission(
    tenantId: string,
    transactionId: string,
    providerId: string,
    baseAmount: Decimal,
  ) {
    // Busca configuração de comissão do profissional
    const config = await this.prisma.providerCommissionConfig.findFirst({
      where: {
        tenantId,
        providerId,
        isActive: true,
        serviceId: null, // Pega config padrão (sem serviço específico)
      },
    });

    if (!config) return null;

    const percentage = config.percentage;
    const amount = baseAmount.times(percentage).dividedBy(100);

    return this.prisma.commission.create({
      data: {
        tenantId,
        transactionId,
        providerId,
        baseAmount,
        percentage,
        amount,
        status: CommissionStatus.PENDING,
      },
    });
  }

  /**
   * Cria transação a partir de um agendamento completado
   */
  async createFromAppointment(tenantId: string, appointmentId: string, createdBy?: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        service: true,
        client: true,
        provider: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Busca ou cria categoria padrão de serviços
    let category = await this.prisma.financialCategory.findFirst({
      where: { tenantId, name: 'Serviços', type: TransactionType.INCOME },
    });

    if (!category) {
      category = await this.prisma.financialCategory.create({
        data: {
          tenantId,
          name: 'Serviços',
          type: TransactionType.INCOME,
          isSystem: true,
        },
      });
    }

    // Cria a transação
    const transaction = await this.createTransaction(
      tenantId,
      {
        type: TransactionType.INCOME,
        categoryId: category.id,
        amount: appointment.price.toNumber(),
        date: appointment.date.toISOString(),
        description: `${appointment.service.name} - ${appointment.client.name}`,
        status: TransactionStatus.PENDING,
        appointmentId: appointment.id,
        clientId: appointment.clientId,
        providerId: appointment.providerId,
        generateCommission: true,
      },
      createdBy,
    );

    return transaction;
  }

  // ============================================================================
  // RECURRING EXPENSES - Despesas Recorrentes
  // ============================================================================

  async findAllRecurringExpenses(tenantId: string, query?: QueryRecurringExpensesDto) {
    const where: any = { tenantId };

    if (query?.expenseType) where.expenseType = query.expenseType;
    if (query?.frequency) where.frequency = query.frequency;
    if (query?.isActive !== undefined) where.isActive = query.isActive;

    return this.prisma.recurringExpense.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ expenseType: 'asc' }, { name: 'asc' }],
    });
  }

  async findRecurringExpenseById(id: string, tenantId: string) {
    const expense = await this.prisma.recurringExpense.findFirst({
      where: { id, tenantId },
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
    });

    if (!expense) {
      throw new NotFoundException('Despesa recorrente não encontrada');
    }

    return expense;
  }

  async createRecurringExpense(tenantId: string, dto: CreateRecurringExpenseDto) {
    // Valida categoria
    const category = await this.prisma.financialCategory.findFirst({
      where: { id: dto.categoryId, tenantId, type: TransactionType.EXPENSE },
    });

    if (!category) {
      throw new NotFoundException('Categoria de despesa não encontrada');
    }

    return this.prisma.recurringExpense.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        categoryId: dto.categoryId,
        amount: new Decimal(dto.amount),
        frequency: dto.frequency,
        dayOfMonth: dto.dayOfMonth,
        dayOfWeek: dto.dayOfWeek,
        expenseType: dto.expenseType || ExpenseType.FIXED,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
    });
  }

  async updateRecurringExpense(id: string, tenantId: string, dto: UpdateRecurringExpenseDto) {
    await this.findRecurringExpenseById(id, tenantId);

    return this.prisma.recurringExpense.update({
      where: { id },
      data: {
        ...dto,
        amount: dto.amount !== undefined ? new Decimal(dto.amount) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
      include: {
        category: { select: { id: true, name: true, color: true } },
      },
    });
  }

  async deleteRecurringExpense(id: string, tenantId: string) {
    await this.findRecurringExpenseById(id, tenantId);

    await this.prisma.recurringExpense.delete({ where: { id } });
    return { message: 'Despesa recorrente removida com sucesso' };
  }

  /**
   * Gera transações a partir das despesas recorrentes pendentes
   */
  async generateRecurringTransactions(tenantId: string) {
    const today = new Date();
    const expenses = await this.prisma.recurringExpense.findMany({
      where: {
        tenantId,
        isActive: true,
        startDate: { lte: today },
        OR: [
          { endDate: null },
          { endDate: { gte: today } },
        ],
      },
    });

    const generated: any[] = [];

    for (const expense of expenses) {
      const shouldGenerate = this.shouldGenerateTransaction(expense, today);

      if (shouldGenerate) {
        const transaction = await this.createTransaction(tenantId, {
          type: TransactionType.EXPENSE,
          categoryId: expense.categoryId,
          amount: expense.amount.toNumber(),
          date: today.toISOString(),
          description: expense.name,
          notes: expense.description || undefined,
          status: TransactionStatus.PENDING,
        });

        // Atualiza última geração
        await this.prisma.recurringExpense.update({
          where: { id: expense.id },
          data: { lastGeneratedAt: today },
        });

        generated.push(transaction);
      }
    }

    return { count: generated.length, transactions: generated };
  }

  private shouldGenerateTransaction(expense: any, today: Date): boolean {
    const lastGenerated = expense.lastGeneratedAt;

    if (!lastGenerated) return true;

    const daysSinceLast = Math.floor(
      (today.getTime() - lastGenerated.getTime()) / (1000 * 60 * 60 * 24),
    );

    switch (expense.frequency) {
      case 'WEEKLY':
        return daysSinceLast >= 7;
      case 'MONTHLY':
        return daysSinceLast >= 28;
      case 'QUARTERLY':
        return daysSinceLast >= 84;
      case 'YEARLY':
        return daysSinceLast >= 365;
      default:
        return false;
    }
  }

  /**
   * Resumo de despesas fixas vs variáveis
   */
  async getExpensesSummary(tenantId: string, query?: FinancialSummaryDto) {
    const startDate = query?.startDate ? new Date(query.startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = query?.endDate ? new Date(query.endDate) : new Date();

    // Despesas fixas totais (baseado nas recorrentes)
    const fixedExpenses = await this.prisma.recurringExpense.aggregate({
      where: {
        tenantId,
        expenseType: ExpenseType.FIXED,
        isActive: true,
      },
      _sum: { amount: true },
      _count: true,
    });

    // Despesas variáveis totais
    const variableExpenses = await this.prisma.recurringExpense.aggregate({
      where: {
        tenantId,
        expenseType: ExpenseType.VARIABLE,
        isActive: true,
      },
      _sum: { amount: true },
      _count: true,
    });

    // Despesas pagas no período
    const paidExpenses = await this.prisma.financialTransaction.aggregate({
      where: {
        tenantId,
        type: TransactionType.EXPENSE,
        status: TransactionStatus.PAID,
        date: { gte: startDate, lte: endDate },
      },
      _sum: { netAmount: true },
      _count: true,
    });

    return {
      period: { startDate, endDate },
      fixedExpenses: {
        monthlyTotal: fixedExpenses._sum.amount?.toNumber() || 0,
        count: fixedExpenses._count,
      },
      variableExpenses: {
        monthlyTotal: variableExpenses._sum.amount?.toNumber() || 0,
        count: variableExpenses._count,
      },
      paidInPeriod: {
        total: paidExpenses._sum.netAmount?.toNumber() || 0,
        count: paidExpenses._count,
      },
    };
  }

  // ============================================================================
  // DRE - Demonstração do Resultado do Exercício
  // ============================================================================

  async getDRE(tenantId: string, query: DREQueryDto) {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    // Receita Bruta (todas as receitas pagas)
    const grossRevenue = await this.prisma.financialTransaction.aggregate({
      where: {
        tenantId,
        type: TransactionType.INCOME,
        status: TransactionStatus.PAID,
        date: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true, discount: true, netAmount: true },
    });

    // Receita por categoria
    const revenueByCategory = await this.prisma.financialTransaction.groupBy({
      by: ['categoryId'],
      where: {
        tenantId,
        type: TransactionType.INCOME,
        status: TransactionStatus.PAID,
        date: { gte: startDate, lte: endDate },
      },
      _sum: { netAmount: true },
    });

    // Despesas por categoria
    const expensesByCategory = await this.prisma.financialTransaction.groupBy({
      by: ['categoryId'],
      where: {
        tenantId,
        type: TransactionType.EXPENSE,
        status: TransactionStatus.PAID,
        date: { gte: startDate, lte: endDate },
      },
      _sum: { netAmount: true },
    });

    // Total de despesas
    const totalExpenses = await this.prisma.financialTransaction.aggregate({
      where: {
        tenantId,
        type: TransactionType.EXPENSE,
        status: TransactionStatus.PAID,
        date: { gte: startDate, lte: endDate },
      },
      _sum: { netAmount: true },
    });

    // Comissões pagas no período
    const commissionsPaid = await this.prisma.commission.aggregate({
      where: {
        tenantId,
        status: CommissionStatus.PAID,
        paidAt: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
    });

    // Busca nomes das categorias
    const categoryIds = [
      ...revenueByCategory.map((r) => r.categoryId),
      ...expensesByCategory.map((e) => e.categoryId),
    ];
    const categories = await this.prisma.financialCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, type: true },
    });

    // Formata receitas por categoria
    const revenueDetails = revenueByCategory.map((r) => {
      const cat = categories.find((c) => c.id === r.categoryId);
      return {
        category: cat?.name || 'Outros',
        amount: r._sum.netAmount?.toNumber() || 0,
      };
    });

    // Formata despesas por categoria
    const expenseDetails = expensesByCategory.map((e) => {
      const cat = categories.find((c) => c.id === e.categoryId);
      return {
        category: cat?.name || 'Outros',
        amount: e._sum.netAmount?.toNumber() || 0,
      };
    });

    const grossRevenueTotal = grossRevenue._sum.amount?.toNumber() || 0;
    const discounts = grossRevenue._sum.discount?.toNumber() || 0;
    const netRevenue = grossRevenue._sum.netAmount?.toNumber() || 0;
    const expenses = totalExpenses._sum.netAmount?.toNumber() || 0;
    const commissions = commissionsPaid._sum.amount?.toNumber() || 0;
    const operatingProfit = netRevenue - expenses - commissions;

    return {
      period: {
        startDate,
        endDate,
      },
      // Receita
      grossRevenue: grossRevenueTotal,
      discounts,
      netRevenue,
      revenueByCategory: revenueDetails,

      // Despesas Operacionais
      operatingExpenses: expenses,
      expensesByCategory: expenseDetails,

      // Comissões
      commissions,

      // Resultado
      operatingProfit,
      profitMargin: netRevenue > 0 ? ((operatingProfit / netRevenue) * 100).toFixed(2) : 0,

      // Indicadores
      indicators: {
        averageTicket: grossRevenue._sum.netAmount && revenueByCategory.length > 0
          ? netRevenue / revenueByCategory.reduce((acc, r) => acc + 1, 0)
          : 0,
        expenseRatio: netRevenue > 0 ? ((expenses / netRevenue) * 100).toFixed(2) : 0,
        commissionRatio: netRevenue > 0 ? ((commissions / netRevenue) * 100).toFixed(2) : 0,
      },
    };
  }

  /**
   * Fluxo de caixa por período
   */
  async getCashFlow(tenantId: string, query: DREQueryDto) {
    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    // Agrupa transações por data
    const transactions = await this.prisma.financialTransaction.findMany({
      where: {
        tenantId,
        status: TransactionStatus.PAID,
        paidAt: { gte: startDate, lte: endDate },
      },
      select: {
        type: true,
        netAmount: true,
        paidAt: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    // Agrupa por dia/mês dependendo do período
    const groupedData = new Map<string, { income: number; expense: number }>();

    for (const t of transactions) {
      const dateKey = query.groupBy === 'monthly'
        ? `${t.paidAt!.getFullYear()}-${String(t.paidAt!.getMonth() + 1).padStart(2, '0')}`
        : t.paidAt!.toISOString().split('T')[0];

      if (!groupedData.has(dateKey)) {
        groupedData.set(dateKey, { income: 0, expense: 0 });
      }

      const data = groupedData.get(dateKey)!;
      if (t.type === TransactionType.INCOME) {
        data.income += t.netAmount.toNumber();
      } else {
        data.expense += t.netAmount.toNumber();
      }
    }

    // Converte para array e calcula saldo acumulado
    let balance = 0;
    const cashFlow = Array.from(groupedData.entries()).map(([date, data]) => {
      balance += data.income - data.expense;
      return {
        date,
        income: data.income,
        expense: data.expense,
        net: data.income - data.expense,
        balance,
      };
    });

    return {
      period: { startDate, endDate },
      cashFlow,
      totals: {
        income: cashFlow.reduce((acc, c) => acc + c.income, 0),
        expense: cashFlow.reduce((acc, c) => acc + c.expense, 0),
        finalBalance: balance,
      },
    };
  }
}
