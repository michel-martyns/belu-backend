import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private transporter: Transporter;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private configService: ConfigService) {
    this.fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL', 'noreply@belu.com.br');
    this.fromName = this.configService.get<string>('SMTP_FROM_NAME', 'Belu');

    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    if (smtpHost && smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.logger.log('Email transporter configured with SMTP');
    } else {
      // Fallback para desenvolvimento - usa ethereal.email ou apenas loga
      this.logger.warn('SMTP not configured. Emails will be logged to console.');
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    try {
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html),
      });

      if (info.message) {
        // jsonTransport retorna a mensagem como JSON
        this.logger.log(`Email logged (dev mode): ${options.subject} -> ${options.to}`);
        this.logger.debug(JSON.parse(info.message));
      } else {
        this.logger.log(`Email sent: ${info.messageId}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      return false;
    }
  }

  async sendPasswordResetEmail(
    to: string,
    userName: string,
    resetLink: string,
  ): Promise<boolean> {
    const subject = 'Recuperação de Senha - Belu';
    const html = this.getPasswordResetTemplate(userName, resetLink);

    return this.sendEmail({ to, subject, html });
  }

  async sendPasswordChangedEmail(to: string, userName: string): Promise<boolean> {
    const subject = 'Sua senha foi alterada - Belu';
    const html = this.getPasswordChangedTemplate(userName);

    return this.sendEmail({ to, subject, html });
  }

  async sendWelcomeEmail(
    to: string,
    userName: string,
    businessName: string,
  ): Promise<boolean> {
    const subject = `Bem-vindo ao Belu, ${userName}!`;
    const html = this.getWelcomeTemplate(userName, businessName);

    return this.sendEmail({ to, subject, html });
  }

  /**
   * Envia código OTP para login de cliente
   */
  async sendOtpEmail(
    to: string,
    code: string,
    clinicName: string,
  ): Promise<boolean> {
    const subject = `Seu código de acesso - ${clinicName}`;
    const html = this.getOtpTemplate(code, clinicName);

    return this.sendEmail({ to, subject, html });
  }

  /**
   * Envia email de recuperação de senha para cliente
   */
  async sendClientPasswordResetEmail(
    to: string,
    clientName: string,
    resetLink: string,
    clinicName: string,
  ): Promise<boolean> {
    const subject = `Recuperação de Senha - ${clinicName}`;
    const html = this.getClientPasswordResetTemplate(clientName, resetLink, clinicName);

    return this.sendEmail({ to, subject, html });
  }

  private getOtpTemplate(code: string, clinicName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Código de Acesso</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${clinicName}</h1>
        <p style="color: #ffffff; opacity: 0.9; margin: 10px 0 0 0;">Portal do Cliente</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px; text-align: center;">
        <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Seu código de acesso</h2>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
          Use o código abaixo para acessar sua conta:
        </p>
        <div style="background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); padding: 20px 40px; border-radius: 12px; display: inline-block;">
          <span style="font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 8px;">${code}</span>
        </div>
        <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
          Este código expira em <strong>10 minutos</strong>.
        </p>
        <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 10px 0 0 0;">
          Se você não solicitou este código, ignore este email.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
        <p style="color: #999999; font-size: 12px; margin: 0;">
          Este é um email automático. Por favor, não responda.
        </p>
        <p style="color: #999999; font-size: 12px; margin: 10px 0 0 0;">
          © ${new Date().getFullYear()} ${clinicName}. Powered by Belu.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private getClientPasswordResetTemplate(
    clientName: string,
    resetLink: string,
    clinicName: string,
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${clinicName}</h1>
        <p style="color: #ffffff; opacity: 0.9; margin: 10px 0 0 0;">Portal do Cliente</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Olá, ${clientName}!</h2>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Recebemos uma solicitação para redefinir a senha da sua conta no portal de ${clinicName}.
          Se você não fez esta solicitação, pode ignorar este email.
        </p>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
          Para criar uma nova senha, clique no botão abaixo:
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center;">
              <a href="${resetLink}"
                 style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                Redefinir Senha
              </a>
            </td>
          </tr>
        </table>
        <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
          Este link expira em <strong>1 hora</strong>. Se você não conseguir clicar no botão,
          copie e cole o link abaixo no seu navegador:
        </p>
        <p style="color: #ec4899; font-size: 14px; word-break: break-all; margin: 10px 0 0 0;">
          ${resetLink}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
        <p style="color: #999999; font-size: 12px; margin: 0;">
          Este é um email automático. Por favor, não responda.
        </p>
        <p style="color: #999999; font-size: 12px; margin: 10px 0 0 0;">
          © ${new Date().getFullYear()} ${clinicName}. Powered by Belu.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private getPasswordResetTemplate(userName: string, resetLink: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Belu</h1>
        <p style="color: #ffffff; opacity: 0.9; margin: 10px 0 0 0;">Sistema para Clínicas de Estética</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Olá, ${userName}!</h2>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Recebemos uma solicitação para redefinir a senha da sua conta.
          Se você não fez esta solicitação, pode ignorar este email.
        </p>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
          Para criar uma nova senha, clique no botão abaixo:
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center;">
              <a href="${resetLink}"
                 style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                Redefinir Senha
              </a>
            </td>
          </tr>
        </table>
        <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
          Este link expira em <strong>1 hora</strong>. Se você não conseguir clicar no botão,
          copie e cole o link abaixo no seu navegador:
        </p>
        <p style="color: #667eea; font-size: 14px; word-break: break-all; margin: 10px 0 0 0;">
          ${resetLink}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
        <p style="color: #999999; font-size: 12px; margin: 0;">
          Este é um email automático. Por favor, não responda.
        </p>
        <p style="color: #999999; font-size: 12px; margin: 10px 0 0 0;">
          © ${new Date().getFullYear()} Belu. Todos os direitos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private getPasswordChangedTemplate(userName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Senha Alterada</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Belu</h1>
        <p style="color: #ffffff; opacity: 0.9; margin: 10px 0 0 0;">Sistema para Clínicas de Estética</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Olá, ${userName}!</h2>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Sua senha foi alterada com sucesso.
        </p>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Se você não fez esta alteração, entre em contato conosco imediatamente
          ou redefina sua senha através do link "Esqueci minha senha" na página de login.
        </p>
        <div style="padding: 20px; background-color: #fff3cd; border-radius: 8px; margin: 20px 0;">
          <p style="color: #856404; font-size: 14px; margin: 0;">
            <strong>Dica de segurança:</strong> Se você não reconhece esta atividade,
            recomendamos também verificar suas outras contas que usam a mesma senha.
          </p>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
        <p style="color: #999999; font-size: 12px; margin: 0;">
          Este é um email automático. Por favor, não responda.
        </p>
        <p style="color: #999999; font-size: 12px; margin: 10px 0 0 0;">
          © ${new Date().getFullYear()} Belu. Todos os direitos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private getWelcomeTemplate(userName: string, businessName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao Belu</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Belu</h1>
        <p style="color: #ffffff; opacity: 0.9; margin: 10px 0 0 0;">Sistema para Clínicas de Estética</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Bem-vindo, ${userName}!</h2>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Sua conta para <strong>${businessName}</strong> foi criada com sucesso!
          Estamos muito felizes em tê-lo conosco.
        </p>
        <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
          Com o Belu, você pode:
        </p>
        <ul style="color: #666666; font-size: 16px; line-height: 1.8; margin: 0 0 20px 0; padding-left: 20px;">
          <li>Gerenciar seus agendamentos</li>
          <li>Cadastrar clientes e profissionais</li>
          <li>Acompanhar seu dashboard</li>
          <li>E muito mais!</li>
        </ul>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
          <tr>
            <td style="text-align: center;">
              <a href="${this.configService.get('FRONTEND_URL', 'http://localhost:3000')}/dashboard"
                 style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">
                Acessar Dashboard
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding: 30px; background-color: #f8f9fa; text-align: center;">
        <p style="color: #999999; font-size: 12px; margin: 0;">
          Precisa de ajuda? Entre em contato com nosso suporte.
        </p>
        <p style="color: #999999; font-size: 12px; margin: 10px 0 0 0;">
          © ${new Date().getFullYear()} Belu. Todos os direitos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
