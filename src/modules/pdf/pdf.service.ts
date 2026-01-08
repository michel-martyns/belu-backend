import { Injectable, Logger } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import * as fs from 'fs';

export interface PdfOptions {
  format?: 'A4' | 'Letter' | 'Legal';
  landscape?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  headerTemplate?: string;
  footerTemplate?: string;
  displayHeaderFooter?: boolean;
  printBackground?: boolean;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private browser: puppeteer.Browser | null = null;

  constructor() {
    // Registrar helpers do Handlebars
    this.registerHandlebarsHelpers();
  }

  private registerHandlebarsHelpers(): void {
    // Formatar data
    Handlebars.registerHelper('formatDate', (date: Date | string) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleDateString('pt-BR');
    });

    // Formatar data e hora
    Handlebars.registerHelper('formatDateTime', (date: Date | string) => {
      if (!date) return '';
      const d = new Date(date);
      return d.toLocaleString('pt-BR');
    });

    // Formatar moeda
    Handlebars.registerHelper('formatCurrency', (value: number) => {
      if (value === undefined || value === null) return 'R$ 0,00';
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(value);
    });

    // Formatar número
    Handlebars.registerHelper('formatNumber', (value: number, decimals = 2) => {
      if (value === undefined || value === null) return '0';
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    });

    // Formatar telefone
    Handlebars.registerHelper('formatPhone', (phone: string) => {
      if (!phone) return '';
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 11) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
      }
      if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
      }
      return phone;
    });

    // Formatar CPF
    Handlebars.registerHelper('formatCpf', (cpf: string) => {
      if (!cpf) return '';
      const cleaned = cpf.replace(/\D/g, '');
      if (cleaned.length === 11) {
        return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
      }
      return cpf;
    });

    // Condicional de igualdade
    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);

    // Condicional de diferença
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);

    // Índice + 1 (para listas numeradas)
    Handlebars.registerHelper('inc', (value: number) => value + 1);

    // Verificar se array tem itens
    Handlebars.registerHelper('hasItems', (arr: any[]) => arr && arr.length > 0);

    // Calcular idade
    Handlebars.registerHelper('age', (birthDate: Date | string) => {
      if (!birthDate) return '';
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age;
    });
  }

  private async getBrowser(): Promise<puppeteer.Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
    }
    return this.browser;
  }

  async generatePdfFromHtml(
    html: string,
    options: PdfOptions = {},
  ): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: options.printBackground ?? true,
        margin: options.margin || {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
        displayHeaderFooter: options.displayHeaderFooter ?? true,
        headerTemplate: options.headerTemplate || '<div></div>',
        footerTemplate:
          options.footerTemplate ||
          `
          <div style="font-size: 10px; width: 100%; text-align: center; color: #666;">
            <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>
        `,
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await page.close();
    }
  }

  async generatePdfFromTemplate(
    templateName: string,
    data: Record<string, any>,
    options: PdfOptions = {},
  ): Promise<Buffer> {
    const templatePath = path.join(
      __dirname,
      'templates',
      `${templateName}.hbs`,
    );

    let templateContent: string;

    try {
      templateContent = fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      this.logger.error(`Template não encontrado: ${templatePath}`);
      throw new Error(`Template não encontrado: ${templateName}`);
    }

    const template = Handlebars.compile(templateContent);
    const html = template(data);

    return this.generatePdfFromHtml(html, options);
  }

  // ============================================================================
  // Templates específicos para o sistema
  // ============================================================================

  async generateMedicalRecordPdf(data: {
    tenant: { name: string; logo?: string; phone?: string; address?: string };
    client: {
      name: string;
      phone?: string;
      email?: string;
      birthDate?: Date;
    };
    medicalRecord: {
      bloodType?: string;
      allergies?: string;
      medications?: string;
      medicalHistory?: string;
      surgeries?: string;
      observations?: string;
    };
    entries: {
      date: Date;
      title: string;
      description: string;
      procedures?: string;
      products?: string;
      notes?: string;
      providerName?: string;
    }[];
    generatedAt: Date;
  }): Promise<Buffer> {
    const html = this.getMedicalRecordTemplate(data);
    return this.generatePdfFromHtml(html);
  }

  async generateSignedDocumentPdf(data: {
    tenant: { name: string; logo?: string };
    document: {
      title: string;
      content: string;
      type: string;
    };
    signature: {
      signerName: string;
      signerDocument?: string;
      signedAt: Date;
      signatureData: string; // Base64
      signatureType: 'DRAWN' | 'TYPED';
      ipAddress?: string;
      verificationCode: string;
    };
    witnesses?: {
      name: string;
      signedAt?: Date;
    }[];
  }): Promise<Buffer> {
    const html = this.getSignedDocumentTemplate(data);
    return this.generatePdfFromHtml(html);
  }

  async generateFinancialReportPdf(data: {
    tenant: { name: string; logo?: string };
    period: { start: Date; end: Date };
    summary: {
      totalIncome: number;
      totalExpense: number;
      balance: number;
    };
    incomeByCategory: { category: string; amount: number }[];
    expenseByCategory: { category: string; amount: number }[];
    transactions: {
      date: Date;
      description: string;
      category: string;
      type: 'INCOME' | 'EXPENSE';
      amount: number;
    }[];
    generatedAt: Date;
  }): Promise<Buffer> {
    const html = this.getFinancialReportTemplate(data);
    return this.generatePdfFromHtml(html, { landscape: true });
  }

  async generateAppointmentReceiptPdf(data: {
    tenant: { name: string; phone?: string; address?: string };
    client: { name: string; phone?: string };
    appointment: {
      date: Date;
      serviceName: string;
      providerName: string;
      price: number;
      discount?: number;
      total: number;
    };
    paymentMethod?: string;
    receiptNumber: string;
    generatedAt: Date;
  }): Promise<Buffer> {
    const html = this.getAppointmentReceiptTemplate(data);
    return this.generatePdfFromHtml(html, {
      format: 'A4',
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
  }

  async generateClientPackagesPdf(data: {
    tenant: { name: string };
    client: { name: string; phone?: string; email?: string };
    packages: {
      name: string;
      code: string;
      purchaseDate: Date;
      expiresAt?: Date;
      status: string;
      items: {
        serviceName: string;
        quantity: number;
        used: number;
        available: number;
      }[];
      salePrice: number;
      paidAmount: number;
    }[];
    generatedAt: Date;
  }): Promise<Buffer> {
    const html = this.getClientPackagesTemplate(data);
    return this.generatePdfFromHtml(html);
  }

  // ============================================================================
  // Templates HTML
  // ============================================================================

  private getBaseStyles(): string {
    return `
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          font-size: 12px;
          line-height: 1.5;
          color: #333;
        }
        .container {
          padding: 20px;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #333;
        }
        .header h1 {
          font-size: 24px;
          margin-bottom: 5px;
        }
        .header p {
          color: #666;
          font-size: 11px;
        }
        .section {
          margin-bottom: 25px;
        }
        .section-title {
          font-size: 14px;
          font-weight: bold;
          color: #333;
          margin-bottom: 10px;
          padding-bottom: 5px;
          border-bottom: 1px solid #ddd;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        .info-item {
          margin-bottom: 8px;
        }
        .info-label {
          font-weight: bold;
          color: #666;
          font-size: 10px;
          text-transform: uppercase;
        }
        .info-value {
          font-size: 12px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        th, td {
          padding: 8px;
          text-align: left;
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f5f5f5;
          font-weight: bold;
          font-size: 11px;
          text-transform: uppercase;
        }
        .text-right {
          text-align: right;
        }
        .text-center {
          text-align: center;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 10px;
          color: #666;
          text-align: center;
        }
        .signature-box {
          border: 1px solid #ddd;
          padding: 15px;
          margin-top: 20px;
          background-color: #f9f9f9;
        }
        .signature-image {
          max-width: 200px;
          max-height: 80px;
        }
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: bold;
        }
        .badge-success {
          background-color: #d4edda;
          color: #155724;
        }
        .badge-warning {
          background-color: #fff3cd;
          color: #856404;
        }
        .badge-danger {
          background-color: #f8d7da;
          color: #721c24;
        }
        .badge-info {
          background-color: #d1ecf1;
          color: #0c5460;
        }
        .amount-positive {
          color: #28a745;
        }
        .amount-negative {
          color: #dc3545;
        }
        .verification-code {
          font-family: monospace;
          font-size: 10px;
          background-color: #f5f5f5;
          padding: 5px 10px;
          border-radius: 4px;
        }
        .entry-box {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 15px;
          background-color: #fafafa;
        }
        .entry-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          padding-bottom: 10px;
          border-bottom: 1px solid #e0e0e0;
        }
        .entry-title {
          font-weight: bold;
          font-size: 13px;
        }
        .entry-date {
          color: #666;
          font-size: 11px;
        }
        .entry-content {
          white-space: pre-wrap;
        }
      </style>
    `;
  }

  private getMedicalRecordTemplate(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${data.tenant.name}</h1>
            ${data.tenant.phone ? `<p>Tel: ${data.tenant.phone}</p>` : ''}
            ${data.tenant.address ? `<p>${data.tenant.address}</p>` : ''}
          </div>

          <h2 style="text-align: center; margin-bottom: 20px;">PRONTUÁRIO MÉDICO</h2>

          <div class="section">
            <div class="section-title">Dados do Paciente</div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Nome</div>
                <div class="info-value">${data.client.name}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Telefone</div>
                <div class="info-value">${data.client.phone || '-'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Email</div>
                <div class="info-value">${data.client.email || '-'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Data de Nascimento</div>
                <div class="info-value">${data.client.birthDate ? new Date(data.client.birthDate).toLocaleDateString('pt-BR') : '-'}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Anamnese</div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Tipo Sanguíneo</div>
                <div class="info-value">${data.medicalRecord.bloodType || '-'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Alergias</div>
                <div class="info-value">${data.medicalRecord.allergies || 'Nenhuma registrada'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Medicamentos em Uso</div>
                <div class="info-value">${data.medicalRecord.medications || 'Nenhum'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Histórico Médico</div>
                <div class="info-value">${data.medicalRecord.medicalHistory || '-'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Cirurgias Anteriores</div>
                <div class="info-value">${data.medicalRecord.surgeries || 'Nenhuma'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Observações</div>
                <div class="info-value">${data.medicalRecord.observations || '-'}</div>
              </div>
            </div>
          </div>

          ${data.entries.length > 0 ? `
            <div class="section">
              <div class="section-title">Histórico de Atendimentos</div>
              ${data.entries.map((entry: any) => `
                <div class="entry-box">
                  <div class="entry-header">
                    <span class="entry-title">${entry.title}</span>
                    <span class="entry-date">${new Date(entry.date).toLocaleDateString('pt-BR')} ${entry.providerName ? `- ${entry.providerName}` : ''}</span>
                  </div>
                  <div class="entry-content">${entry.description}</div>
                  ${entry.procedures ? `<p style="margin-top: 10px;"><strong>Procedimentos:</strong> ${entry.procedures}</p>` : ''}
                  ${entry.products ? `<p><strong>Produtos utilizados:</strong> ${entry.products}</p>` : ''}
                  ${entry.notes ? `<p><strong>Observações:</strong> ${entry.notes}</p>` : ''}
                </div>
              `).join('')}
            </div>
          ` : ''}

          <div class="footer">
            <p>Documento gerado em ${new Date(data.generatedAt).toLocaleString('pt-BR')}</p>
            <p>Este documento é confidencial e contém informações médicas protegidas.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getSignedDocumentTemplate(data: any): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${data.tenant.name}</h1>
          </div>

          <h2 style="text-align: center; margin-bottom: 20px;">${data.document.title}</h2>

          <div class="section">
            <div class="document-content">
              ${data.document.content}
            </div>
          </div>

          <div class="signature-box">
            <div class="section-title">Assinatura Digital</div>
            <div class="info-grid">
              <div class="info-item">
                <div class="info-label">Assinante</div>
                <div class="info-value">${data.signature.signerName}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Documento</div>
                <div class="info-value">${data.signature.signerDocument || '-'}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Data e Hora</div>
                <div class="info-value">${new Date(data.signature.signedAt).toLocaleString('pt-BR')}</div>
              </div>
              <div class="info-item">
                <div class="info-label">IP</div>
                <div class="info-value">${data.signature.ipAddress || '-'}</div>
              </div>
            </div>

            <div style="margin-top: 15px;">
              <div class="info-label">Assinatura</div>
              ${data.signature.signatureType === 'DRAWN'
                ? `<img src="${data.signature.signatureData}" class="signature-image" alt="Assinatura" />`
                : `<p style="font-family: 'Brush Script MT', cursive; font-size: 24px;">${data.signature.signatureData}</p>`
              }
            </div>

            <div style="margin-top: 15px;">
              <div class="info-label">Código de Verificação</div>
              <span class="verification-code">${data.signature.verificationCode}</span>
            </div>
          </div>

          ${data.witnesses && data.witnesses.length > 0 ? `
            <div class="section" style="margin-top: 20px;">
              <div class="section-title">Testemunhas</div>
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Data/Hora da Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.witnesses.map((w: any) => `
                    <tr>
                      <td>${w.name}</td>
                      <td>${w.signedAt ? new Date(w.signedAt).toLocaleString('pt-BR') : 'Pendente'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          <div class="footer">
            <p>Este documento foi assinado digitalmente e possui validade jurídica.</p>
            <p>Para verificar a autenticidade, acesse: ${process.env.APP_URL || 'https://app.belu.com.br'}/verify/${data.signature.verificationCode}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getFinancialReportTemplate(data: any): string {
    const formatCurrency = (value: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${data.tenant.name}</h1>
            <p>Relatório Financeiro</p>
          </div>

          <div class="section">
            <div class="section-title">Período: ${new Date(data.period.start).toLocaleDateString('pt-BR')} a ${new Date(data.period.end).toLocaleDateString('pt-BR')}</div>
          </div>

          <div class="section">
            <div class="section-title">Resumo</div>
            <table>
              <tr>
                <td><strong>Total de Receitas</strong></td>
                <td class="text-right amount-positive">${formatCurrency(data.summary.totalIncome)}</td>
              </tr>
              <tr>
                <td><strong>Total de Despesas</strong></td>
                <td class="text-right amount-negative">${formatCurrency(data.summary.totalExpense)}</td>
              </tr>
              <tr style="font-size: 14px;">
                <td><strong>Saldo</strong></td>
                <td class="text-right ${data.summary.balance >= 0 ? 'amount-positive' : 'amount-negative'}">
                  <strong>${formatCurrency(data.summary.balance)}</strong>
                </td>
              </tr>
            </table>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div class="section">
              <div class="section-title">Receitas por Categoria</div>
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th class="text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.incomeByCategory.map((item: any) => `
                    <tr>
                      <td>${item.category}</td>
                      <td class="text-right">${formatCurrency(item.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Despesas por Categoria</div>
              <table>
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th class="text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.expenseByCategory.map((item: any) => `
                    <tr>
                      <td>${item.category}</td>
                      <td class="text-right">${formatCurrency(item.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          ${data.transactions.length > 0 ? `
            <div class="section">
              <div class="section-title">Transações</div>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Categoria</th>
                    <th class="text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${data.transactions.map((t: any) => `
                    <tr>
                      <td>${new Date(t.date).toLocaleDateString('pt-BR')}</td>
                      <td>${t.description}</td>
                      <td>${t.category}</td>
                      <td class="text-right ${t.type === 'INCOME' ? 'amount-positive' : 'amount-negative'}">
                        ${t.type === 'EXPENSE' ? '-' : ''}${formatCurrency(t.amount)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          <div class="footer">
            <p>Documento gerado em ${new Date(data.generatedAt).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getAppointmentReceiptTemplate(data: any): string {
    const formatCurrency = (value: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        ${this.getBaseStyles()}
        <style>
          .receipt {
            max-width: 400px;
            margin: 0 auto;
            border: 1px solid #ddd;
            padding: 20px;
          }
          .receipt-header {
            text-align: center;
            border-bottom: 1px dashed #ddd;
            padding-bottom: 15px;
            margin-bottom: 15px;
          }
          .receipt-number {
            font-size: 10px;
            color: #666;
          }
          .receipt-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
          }
          .receipt-total {
            border-top: 1px dashed #ddd;
            padding-top: 10px;
            margin-top: 10px;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="receipt-header">
            <h2>${data.tenant.name}</h2>
            ${data.tenant.phone ? `<p>Tel: ${data.tenant.phone}</p>` : ''}
            ${data.tenant.address ? `<p style="font-size: 10px;">${data.tenant.address}</p>` : ''}
            <p class="receipt-number">Recibo Nº ${data.receiptNumber}</p>
          </div>

          <div style="margin-bottom: 15px;">
            <p><strong>Cliente:</strong> ${data.client.name}</p>
            <p><strong>Data:</strong> ${new Date(data.appointment.date).toLocaleDateString('pt-BR')}</p>
          </div>

          <div style="margin-bottom: 15px;">
            <div class="receipt-item">
              <span>${data.appointment.serviceName}</span>
              <span>${formatCurrency(data.appointment.price)}</span>
            </div>
            <p style="font-size: 10px; color: #666;">Profissional: ${data.appointment.providerName}</p>
          </div>

          ${data.appointment.discount ? `
            <div class="receipt-item">
              <span>Desconto</span>
              <span>-${formatCurrency(data.appointment.discount)}</span>
            </div>
          ` : ''}

          <div class="receipt-item receipt-total">
            <span>TOTAL</span>
            <span>${formatCurrency(data.appointment.total)}</span>
          </div>

          ${data.paymentMethod ? `
            <p style="margin-top: 10px; font-size: 11px;">
              <strong>Forma de pagamento:</strong> ${data.paymentMethod}
            </p>
          ` : ''}

          <div class="footer" style="margin-top: 20px;">
            <p>Gerado em ${new Date(data.generatedAt).toLocaleString('pt-BR')}</p>
            <p>Obrigado pela preferência!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private getClientPackagesTemplate(data: any): string {
    const formatCurrency = (value: number) =>
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    const getStatusBadge = (status: string) => {
      const badges: Record<string, string> = {
        ACTIVE: '<span class="badge badge-success">Ativo</span>',
        PENDING_PAYMENT: '<span class="badge badge-warning">Pend. Pagamento</span>',
        EXPIRED: '<span class="badge badge-danger">Expirado</span>',
        COMPLETED: '<span class="badge badge-info">Concluído</span>',
        CANCELLED: '<span class="badge badge-danger">Cancelado</span>',
      };
      return badges[status] || status;
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        ${this.getBaseStyles()}
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${data.tenant.name}</h1>
            <p>Extrato de Pacotes</p>
          </div>

          <div class="section">
            <div class="section-title">Dados do Cliente</div>
            <p><strong>Nome:</strong> ${data.client.name}</p>
            ${data.client.phone ? `<p><strong>Telefone:</strong> ${data.client.phone}</p>` : ''}
            ${data.client.email ? `<p><strong>Email:</strong> ${data.client.email}</p>` : ''}
          </div>

          ${data.packages.map((pkg: any) => `
            <div class="section">
              <div class="section-title">
                ${pkg.name}
                <span style="font-weight: normal; font-size: 11px; color: #666;">(${pkg.code})</span>
                ${getStatusBadge(pkg.status)}
              </div>

              <div class="info-grid" style="margin-bottom: 15px;">
                <div class="info-item">
                  <div class="info-label">Data da Compra</div>
                  <div class="info-value">${new Date(pkg.purchaseDate).toLocaleDateString('pt-BR')}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Validade</div>
                  <div class="info-value">${pkg.expiresAt ? new Date(pkg.expiresAt).toLocaleDateString('pt-BR') : 'Sem validade'}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Valor</div>
                  <div class="info-value">${formatCurrency(pkg.salePrice)}</div>
                </div>
                <div class="info-item">
                  <div class="info-label">Pago</div>
                  <div class="info-value">${formatCurrency(pkg.paidAmount)}</div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th class="text-center">Total</th>
                    <th class="text-center">Usado</th>
                    <th class="text-center">Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  ${pkg.items.map((item: any) => `
                    <tr>
                      <td>${item.serviceName}</td>
                      <td class="text-center">${item.quantity}</td>
                      <td class="text-center">${item.used}</td>
                      <td class="text-center"><strong>${item.available}</strong></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `).join('')}

          <div class="footer">
            <p>Documento gerado em ${new Date(data.generatedAt).toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}
