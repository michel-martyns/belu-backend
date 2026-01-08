import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/current-user.decorator';
import { PdfService } from './pdf.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('pdf')
@UseGuards(JwtAuthGuard)
export class PdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================================
  // Exportar Prontuário Médico
  // ============================================================================

  @Get('medical-records/:clientId')
  async exportMedicalRecord(
    @Param('clientId') clientId: string,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Buscar tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    // Buscar cliente
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // Buscar prontuário
    const medicalRecord = await this.prisma.medicalRecord.findFirst({
      where: { clientId, tenantId },
    });

    // Buscar entradas do prontuário
    const entries = await this.prisma.medicalRecordEntry.findMany({
      where: { medicalRecord: { clientId, tenantId } },
      include: {
        provider: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const pdfBuffer = await this.pdfService.generateMedicalRecordPdf({
      tenant: {
        name: tenant.name,
      },
      client: {
        name: client.name,
        phone: client.phone || undefined,
        email: client.email || undefined,
      },
      medicalRecord: medicalRecord
        ? {
            bloodType: medicalRecord.bloodType || undefined,
            allergies: medicalRecord.allergies || undefined,
            medications: medicalRecord.medications || undefined,
            medicalHistory: medicalRecord.medicalHistory || undefined,
            surgeries: medicalRecord.surgeries || undefined,
            observations: medicalRecord.observations || undefined,
          }
        : {},
      entries: entries.map((entry) => ({
        date: entry.createdAt,
        title: entry.title,
        description: entry.description || '',
        procedures: entry.procedures || undefined,
        products: entry.products || undefined,
        notes: entry.notes || undefined,
        providerName: entry.provider?.name,
      })),
      generatedAt: new Date(),
    });

    const fileName = `prontuario_${client.name.replace(/\s/g, '_')}_${Date.now()}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  // ============================================================================
  // Exportar Documento Assinado
  // ============================================================================

  @Get('signed-documents/:requestId')
  async exportSignedDocument(
    @Param('requestId') requestId: string,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Buscar tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    // Buscar solicitação de assinatura com assinatura
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id: requestId, tenantId },
      include: {
        template: true,
        signature: true,
        witnesses: true,
        client: { select: { name: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitação de assinatura não encontrada');
    }

    if (!request.signature) {
      throw new BadRequestException('Este documento ainda não foi assinado');
    }

    const pdfBuffer = await this.pdfService.generateSignedDocumentPdf({
      tenant: {
        name: tenant.name,
      },
      document: {
        title: request.title || request.template?.name || 'Documento',
        content: request.documentContent,
        type: request.documentType,
      },
      signature: {
        signerName: request.signature.signerName,
        signerDocument: request.signature.signerDocument || undefined,
        signedAt: request.signature.signedAt,
        signatureData: request.signature.signatureData,
        signatureType: request.signature.signatureType as 'DRAWN' | 'TYPED',
        ipAddress: request.signature.ipAddress || undefined,
        verificationCode: request.code,
      },
      witnesses: request.witnesses.map((w) => ({
        name: w.name,
        signedAt: w.signedAt || undefined,
      })),
    });

    const fileName = `documento_assinado_${request.code}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  // ============================================================================
  // Exportar Relatório Financeiro
  // ============================================================================

  @Get('financial-report')
  async exportFinancialReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('includeTransactions') includeTransactions: string,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!startDate || !endDate) {
      throw new BadRequestException('Data inicial e final são obrigatórias');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Buscar tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    // Buscar transações
    const transactions = await this.prisma.financialTransaction.findMany({
      where: {
        tenantId,
        date: { gte: start, lte: end },
      },
      include: {
        category: { select: { name: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Calcular resumo
    const income = transactions
      .filter((t) => t.type === 'INCOME')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const expense = transactions
      .filter((t) => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    // Agrupar por categoria
    const incomeByCategory = new Map<string, number>();
    const expenseByCategory = new Map<string, number>();

    transactions.forEach((t) => {
      const categoryName = t.category?.name || 'Sem categoria';
      if (t.type === 'INCOME') {
        incomeByCategory.set(
          categoryName,
          (incomeByCategory.get(categoryName) || 0) + Number(t.amount),
        );
      } else {
        expenseByCategory.set(
          categoryName,
          (expenseByCategory.get(categoryName) || 0) + Number(t.amount),
        );
      }
    });

    const pdfBuffer = await this.pdfService.generateFinancialReportPdf({
      tenant: { name: tenant.name },
      period: { start, end },
      summary: {
        totalIncome: income,
        totalExpense: expense,
        balance: income - expense,
      },
      incomeByCategory: Array.from(incomeByCategory.entries()).map(
        ([category, amount]) => ({ category, amount }),
      ),
      expenseByCategory: Array.from(expenseByCategory.entries()).map(
        ([category, amount]) => ({ category, amount }),
      ),
      transactions:
        includeTransactions === 'true'
          ? transactions.map((t) => ({
              date: t.date,
              description: t.description,
              category: t.category?.name || 'Sem categoria',
              type: t.type as 'INCOME' | 'EXPENSE',
              amount: Number(t.amount),
            }))
          : [],
      generatedAt: new Date(),
    });

    const fileName = `relatorio_financeiro_${startDate}_${endDate}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  // ============================================================================
  // Exportar Recibo de Agendamento
  // ============================================================================

  @Get('appointment-receipt/:appointmentId')
  async exportAppointmentReceipt(
    @Param('appointmentId') appointmentId: string,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Buscar tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    // Buscar agendamento
    const appointment = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId },
      include: {
        client: { select: { name: true, phone: true } },
        service: { select: { name: true, price: true } },
        provider: { select: { name: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Gerar número do recibo
    const receiptNumber = `REC-${Date.now().toString(36).toUpperCase()}`;

    const pdfBuffer = await this.pdfService.generateAppointmentReceiptPdf({
      tenant: {
        name: tenant.name,
      },
      client: {
        name: appointment.client.name,
        phone: appointment.client.phone || undefined,
      },
      appointment: {
        date: appointment.date,
        serviceName: appointment.service.name,
        providerName: appointment.provider.name,
        price: Number(appointment.service.price),
        total: Number(appointment.price),
      },
      receiptNumber,
      generatedAt: new Date(),
    });

    const fileName = `recibo_${receiptNumber}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  // ============================================================================
  // Exportar Pacotes do Cliente
  // ============================================================================

  @Get('client-packages/:clientId')
  async exportClientPackages(
    @Param('clientId') clientId: string,
    @Query('status') status: string,
    @TenantId() tenantId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Buscar tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    // Buscar cliente
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // Buscar pacotes
    const whereClause: any = {
      clientId,
      tenantId,
    };

    if (status) {
      whereClause.status = status;
    }

    const packages = await this.prisma.clientPackage.findMany({
      where: whereClause,
      include: {
        packageTemplate: { select: { name: true } },
        items: {
          include: {
            service: { select: { name: true } },
          },
        },
      },
      orderBy: { purchaseDate: 'desc' },
    });

    const pdfBuffer = await this.pdfService.generateClientPackagesPdf({
      tenant: { name: tenant.name },
      client: {
        name: client.name,
        phone: client.phone || undefined,
        email: client.email || undefined,
      },
      packages: packages.map((pkg) => ({
        name: pkg.name || pkg.packageTemplate?.name || 'Pacote',
        code: pkg.code || '',
        purchaseDate: pkg.purchaseDate,
        expiresAt: pkg.expiresAt || undefined,
        status: pkg.status,
        items: pkg.items.map((item) => ({
          serviceName: item.service.name,
          quantity: item.quantity,
          used: item.usedQuantity,
          available: item.quantity - item.usedQuantity,
        })),
        salePrice: Number(pkg.salePrice),
        paidAmount: Number(pkg.paidAmount),
      })),
      generatedAt: new Date(),
    });

    const fileName = `pacotes_${client.name.replace(/\s/g, '_')}_${Date.now()}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }
}
