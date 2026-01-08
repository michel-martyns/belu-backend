import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueuesService } from '../queues.service';
import { EmailService } from '../../modules/email/email.service';
import { QUEUE_NAMES, EMAIL_JOBS, EmailJobData } from '../queues.constants';

@Injectable()
export class EmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private queuesService: QueuesService,
    private emailService: EmailService,
  ) {}

  onModuleInit() {
    this.queuesService.registerWorker(
      QUEUE_NAMES.EMAIL,
      this.process.bind(this),
      { concurrency: 3 }, // Processar 3 emails simultaneamente
    );
    this.logger.log('Email processor initialized');
  }

  async process(job: Job<EmailJobData>): Promise<any> {
    this.logger.debug(`Processing email job ${job.id}: ${job.name}`);

    const { data } = job;

    try {
      switch (job.name) {
        case EMAIL_JOBS.SEND_EMAIL:
          return this.handleSendEmail(job);

        case EMAIL_JOBS.SEND_PASSWORD_RESET:
          return this.handlePasswordReset(job);

        case EMAIL_JOBS.SEND_WELCOME:
          return this.handleWelcome(job);

        case EMAIL_JOBS.SEND_PASSWORD_CHANGED:
          return this.handlePasswordChanged(job);

        case EMAIL_JOBS.SEND_APPOINTMENT_CONFIRMATION:
          return this.handleAppointmentConfirmation(job);

        case EMAIL_JOBS.SEND_APPOINTMENT_REMINDER:
          return this.handleAppointmentReminder(job);

        default:
          this.logger.warn(`Unknown email job type: ${job.name}`);
          return this.handleSendEmail(job);
      }
    } catch (error) {
      this.logger.error(`Email job ${job.id} failed: ${error.message}`);
      throw error;
    }
  }

  private async handleSendEmail(job: Job<EmailJobData>): Promise<boolean> {
    const { to, subject, html, text } = job.data;

    await job.updateProgress(10);

    const result = await this.emailService.sendEmail({
      to,
      subject,
      html: html || '',
      text,
    });

    await job.updateProgress(100);

    if (result) {
      this.logger.log(`Email sent successfully to ${to}`);
    } else {
      throw new Error(`Failed to send email to ${to}`);
    }

    return result;
  }

  private async handlePasswordReset(job: Job<EmailJobData>): Promise<boolean> {
    const { to, context } = job.data;
    const { userName, resetLink } = context || {};

    await job.updateProgress(10);

    const result = await this.emailService.sendPasswordResetEmail(
      to,
      userName || 'Usuário',
      resetLink || '',
    );

    await job.updateProgress(100);

    if (result) {
      this.logger.log(`Password reset email sent to ${to}`);
    } else {
      throw new Error(`Failed to send password reset email to ${to}`);
    }

    return result;
  }

  private async handleWelcome(job: Job<EmailJobData>): Promise<boolean> {
    const { to, context } = job.data;
    const { userName, businessName } = context || {};

    await job.updateProgress(10);

    const result = await this.emailService.sendWelcomeEmail(
      to,
      userName || 'Usuário',
      businessName || 'Belu',
    );

    await job.updateProgress(100);

    if (result) {
      this.logger.log(`Welcome email sent to ${to}`);
    } else {
      throw new Error(`Failed to send welcome email to ${to}`);
    }

    return result;
  }

  private async handlePasswordChanged(job: Job<EmailJobData>): Promise<boolean> {
    const { to, context } = job.data;
    const { userName } = context || {};

    await job.updateProgress(10);

    const result = await this.emailService.sendPasswordChangedEmail(
      to,
      userName || 'Usuário',
    );

    await job.updateProgress(100);

    if (result) {
      this.logger.log(`Password changed email sent to ${to}`);
    } else {
      throw new Error(`Failed to send password changed email to ${to}`);
    }

    return result;
  }

  private async handleAppointmentConfirmation(job: Job<EmailJobData>): Promise<boolean> {
    const { to, context } = job.data;
    const {
      clientName,
      serviceName,
      providerName,
      date,
      time,
      businessName,
    } = context || {};

    await job.updateProgress(10);

    const html = this.buildAppointmentConfirmationEmail({
      clientName: clientName || 'Cliente',
      serviceName: serviceName || 'Serviço',
      providerName: providerName || 'Profissional',
      date: date || '',
      time: time || '',
      businessName: businessName || 'Belu',
    });

    const result = await this.emailService.sendEmail({
      to,
      subject: `Confirmação de Agendamento - ${businessName || 'Belu'}`,
      html,
    });

    await job.updateProgress(100);

    if (result) {
      this.logger.log(`Appointment confirmation email sent to ${to}`);
    } else {
      throw new Error(`Failed to send appointment confirmation to ${to}`);
    }

    return result;
  }

  private async handleAppointmentReminder(job: Job<EmailJobData>): Promise<boolean> {
    const { to, context } = job.data;
    const {
      clientName,
      serviceName,
      providerName,
      date,
      time,
      businessName,
    } = context || {};

    await job.updateProgress(10);

    const html = this.buildAppointmentReminderEmail({
      clientName: clientName || 'Cliente',
      serviceName: serviceName || 'Serviço',
      providerName: providerName || 'Profissional',
      date: date || '',
      time: time || '',
      businessName: businessName || 'Belu',
    });

    const result = await this.emailService.sendEmail({
      to,
      subject: `Lembrete de Agendamento - ${businessName || 'Belu'}`,
      html,
    });

    await job.updateProgress(100);

    if (result) {
      this.logger.log(`Appointment reminder email sent to ${to}`);
    } else {
      throw new Error(`Failed to send appointment reminder to ${to}`);
    }

    return result;
  }

  private buildAppointmentConfirmationEmail(data: {
    clientName: string;
    serviceName: string;
    providerName: string;
    date: string;
    time: string;
    businessName: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .detail-row:last-child { border-bottom: none; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Agendamento Confirmado!</h1>
          </div>
          <div class="content">
            <p>Olá <strong>${data.clientName}</strong>,</p>
            <p>Seu agendamento foi confirmado com sucesso!</p>

            <div class="details">
              <div class="detail-row">
                <span>Serviço:</span>
                <strong>${data.serviceName}</strong>
              </div>
              <div class="detail-row">
                <span>Profissional:</span>
                <strong>${data.providerName}</strong>
              </div>
              <div class="detail-row">
                <span>Data:</span>
                <strong>${data.date}</strong>
              </div>
              <div class="detail-row">
                <span>Horário:</span>
                <strong>${data.time}</strong>
              </div>
            </div>

            <p>Aguardamos você!</p>
          </div>
          <div class="footer">
            <p>${data.businessName}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private buildAppointmentReminderEmail(data: {
    clientName: string;
    serviceName: string;
    providerName: string;
    date: string;
    time: string;
    businessName: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .detail-row:last-child { border-bottom: none; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Lembrete de Agendamento</h1>
          </div>
          <div class="content">
            <p>Olá <strong>${data.clientName}</strong>,</p>
            <p>Este é um lembrete do seu agendamento:</p>

            <div class="details">
              <div class="detail-row">
                <span>Serviço:</span>
                <strong>${data.serviceName}</strong>
              </div>
              <div class="detail-row">
                <span>Profissional:</span>
                <strong>${data.providerName}</strong>
              </div>
              <div class="detail-row">
                <span>Data:</span>
                <strong>${data.date}</strong>
              </div>
              <div class="detail-row">
                <span>Horário:</span>
                <strong>${data.time}</strong>
              </div>
            </div>

            <p>Aguardamos você!</p>
          </div>
          <div class="footer">
            <p>${data.businessName}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
