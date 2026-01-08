import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import {
  ClientRegisterDto,
  ClientLoginDto,
  RequestOtpDto,
  VerifyOtpDto,
  ClientForgotPasswordDto,
  ClientResetPasswordDto,
  ClientAuthResponse,
  ClientTokenResponse,
  ClientUpdateProfileDto,
  ClientChangePasswordDto,
} from './dto/client-auth.dto';

// Constantes de expiração
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutos em segundos
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 dias
const PASSWORD_RESET_EXPIRY_HOURS = 1; // 1 hora
const OTP_EXPIRY_MINUTES = 10; // 10 minutos

@Injectable()
export class ClientAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  /**
   * Registra um novo cliente no portal
   */
  async register(
    dto: ClientRegisterDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<ClientAuthResponse> {
    // Busca o tenant pelo slug
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (!tenant) {
      throw new NotFoundException('Clínica não encontrada');
    }

    if (!tenant.isActive) {
      throw new BadRequestException('Esta clínica não está ativa');
    }

    // Verifica se já existe cliente com este email neste tenant
    const existingClient = await this.prisma.client.findFirst({
      where: {
        tenantId: tenant.id,
        email: dto.email,
        deletedAt: null,
      },
    });

    if (existingClient) {
      // Se já existe mas não tem senha, permite definir uma
      if (!existingClient.password) {
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const updatedClient = await this.prisma.client.update({
          where: { id: existingClient.id },
          data: {
            password: hashedPassword,
            name: dto.name || existingClient.name,
            phone: dto.phone || existingClient.phone,
          },
          include: { tenant: true },
        });

        return this.generateAuthResponse(updatedClient, userAgent, ipAddress);
      }
      throw new ConflictException('Email já cadastrado nesta clínica');
    }

    // Cria novo cliente
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const client = await this.prisma.client.create({
      data: {
        tenantId: tenant.id,
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        phone: dto.phone,
      },
      include: { tenant: true },
    });

    return this.generateAuthResponse(client, userAgent, ipAddress);
  }

  /**
   * Login com email e senha
   */
  async login(
    dto: ClientLoginDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<ClientAuthResponse> {
    // Busca o tenant pelo slug
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (!tenant) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (!tenant.isActive) {
      throw new UnauthorizedException('Esta clínica não está ativa');
    }

    // Busca o cliente
    const client = await this.prisma.client.findFirst({
      where: {
        tenantId: tenant.id,
        email: dto.email,
        deletedAt: null,
      },
      include: { tenant: true },
    });

    if (!client) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (!client.password) {
      throw new UnauthorizedException(
        'Esta conta não possui senha. Use o login por código.',
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, client.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Atualiza último login
    await this.prisma.client.update({
      where: { id: client.id },
      data: { lastLoginAt: new Date() },
    });

    return this.generateAuthResponse(client, userAgent, ipAddress);
  }

  /**
   * Solicita código OTP por email
   */
  async requestOtp(dto: RequestOtpDto): Promise<{ message: string }> {
    // Busca o tenant pelo slug
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (!tenant || !tenant.isActive) {
      // Retorna sucesso para não expor informações
      return { message: 'Se o email estiver cadastrado, você receberá um código.' };
    }

    // Busca ou cria cliente
    let client = await this.prisma.client.findFirst({
      where: {
        tenantId: tenant.id,
        email: dto.email,
        deletedAt: null,
      },
    });

    // Invalida OTPs anteriores
    await this.prisma.clientOtpToken.updateMany({
      where: {
        email: dto.email,
        tenantId: tenant.id,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // Gera código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

    // Salva OTP
    await this.prisma.clientOtpToken.create({
      data: {
        clientId: client?.id,
        email: dto.email,
        tenantId: tenant.id,
        code,
        expiresAt,
      },
    });

    // Envia email com o código
    await this.emailService.sendOtpEmail(dto.email, code, tenant.name);

    return { message: 'Se o email estiver cadastrado, você receberá um código.' };
  }

  /**
   * Verifica OTP e faz login
   */
  async verifyOtp(
    dto: VerifyOtpDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<ClientAuthResponse> {
    // Busca o tenant pelo slug
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (!tenant || !tenant.isActive) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    // Busca o OTP
    const otp = await this.prisma.clientOtpToken.findFirst({
      where: {
        email: dto.email,
        tenantId: tenant.id,
        code: dto.code,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otp) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    // Marca OTP como usado
    await this.prisma.clientOtpToken.update({
      where: { id: otp.id },
      data: { usedAt: new Date() },
    });

    // Busca ou cria cliente
    let client = await this.prisma.client.findFirst({
      where: {
        tenantId: tenant.id,
        email: dto.email,
        deletedAt: null,
      },
      include: { tenant: true },
    });

    if (!client) {
      // Cria cliente se não existir (primeiro acesso via OTP)
      client = await this.prisma.client.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          name: dto.email.split('@')[0], // Nome temporário
          phone: '',
          isEmailVerified: true,
        },
        include: { tenant: true },
      });
    } else {
      // Marca email como verificado
      await this.prisma.client.update({
        where: { id: client.id },
        data: {
          isEmailVerified: true,
          lastLoginAt: new Date(),
        },
      });
    }

    return this.generateAuthResponse(client, userAgent, ipAddress);
  }

  /**
   * Renova tokens usando refresh token
   */
  async refreshTokens(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<ClientTokenResponse> {
    const storedToken = await this.prisma.clientRefreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        client: {
          include: { tenant: true },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Token inválido');
    }

    if (storedToken.isRevoked) {
      // Possível reutilização - revoga todos os tokens
      await this.revokeAllClientTokens(storedToken.clientId);
      throw new UnauthorizedException('Token revogado');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token expirado');
    }

    if (storedToken.client.deletedAt || !storedToken.client.tenant.isActive) {
      throw new UnauthorizedException('Conta ou clínica desativada');
    }

    // Revoga token atual (rotation)
    await this.prisma.clientRefreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Gera novos tokens
    return this.generateTokens(
      storedToken.client.id,
      storedToken.client.email!,
      storedToken.client.tenantId,
      userAgent,
      ipAddress,
    );
  }

  /**
   * Logout - revoga refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.clientRefreshToken.updateMany({
      where: { token: refreshToken },
      data: { isRevoked: true },
    });
  }

  /**
   * Retorna dados do cliente logado
   */
  async me(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { tenant: true },
    });

    if (!client || client.deletedAt) {
      throw new UnauthorizedException('Cliente não encontrado');
    }

    return {
      client: {
        id: client.id,
        tenantId: client.tenantId,
        email: client.email,
        name: client.name,
        phone: client.phone,
        isEmailVerified: client.isEmailVerified,
        createdAt: client.createdAt,
      },
      tenant: {
        id: client.tenant.id,
        name: client.tenant.name,
        slug: client.tenant.slug,
      },
    };
  }

  /**
   * Solicita recuperação de senha
   */
  async forgotPassword(dto: ClientForgotPasswordDto): Promise<{ message: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (!tenant || !tenant.isActive) {
      return {
        message: 'Se o email estiver cadastrado, você receberá um link para redefinir sua senha.',
      };
    }

    const client = await this.prisma.client.findFirst({
      where: {
        tenantId: tenant.id,
        email: dto.email,
        deletedAt: null,
      },
    });

    if (!client) {
      return {
        message: 'Se o email estiver cadastrado, você receberá um link para redefinir sua senha.',
      };
    }

    // Invalida tokens anteriores
    await this.prisma.clientPasswordResetToken.updateMany({
      where: { clientId: client.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Gera novo token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_EXPIRY_HOURS);

    await this.prisma.clientPasswordResetToken.create({
      data: {
        clientId: client.id,
        token,
        expiresAt,
      },
    });

    // Envia email
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const resetLink = `${frontendUrl}/cliente/redefinir-senha?token=${token}`;

    await this.emailService.sendClientPasswordResetEmail(
      client.email!,
      client.name,
      resetLink,
      tenant.name,
    );

    return {
      message: 'Se o email estiver cadastrado, você receberá um link para redefinir sua senha.',
    };
  }

  /**
   * Verifica se token de reset é válido
   */
  async verifyResetToken(token: string): Promise<{ valid: boolean }> {
    const resetToken = await this.prisma.clientPasswordResetToken.findUnique({
      where: { token },
    });

    const valid =
      resetToken !== null &&
      resetToken.usedAt === null &&
      resetToken.expiresAt > new Date();

    return { valid };
  }

  /**
   * Redefine a senha
   */
  async resetPassword(dto: ClientResetPasswordDto): Promise<{ message: string }> {
    const resetToken = await this.prisma.clientPasswordResetToken.findUnique({
      where: { token: dto.token },
      include: { client: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Token inválido');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Token já utilizado');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Token expirado');
    }

    // Hash da nova senha
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Atualiza senha e marca token como usado
    await this.prisma.$transaction([
      this.prisma.client.update({
        where: { id: resetToken.clientId },
        data: { password: hashedPassword },
      }),
      this.prisma.clientPasswordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Revoga todos os refresh tokens para forçar re-login
      this.prisma.clientRefreshToken.updateMany({
        where: { clientId: resetToken.clientId },
        data: { isRevoked: true },
      }),
    ]);

    return { message: 'Senha redefinida com sucesso' };
  }

  /**
   * Atualiza perfil do cliente
   */
  async updateProfile(clientId: string, dto: ClientUpdateProfileDto) {
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.phone && { phone: dto.phone }),
      },
    });

    return {
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
    };
  }

  /**
   * Altera senha do cliente
   */
  async changePassword(
    clientId: string,
    dto: ClientChangePasswordDto,
  ): Promise<{ message: string }> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client || !client.password) {
      throw new BadRequestException('Operação não permitida');
    }

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, client.password);
    if (!isCurrentValid) {
      throw new BadRequestException('Senha atual incorreta');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.client.update({
      where: { id: clientId },
      data: { password: hashedPassword },
    });

    return { message: 'Senha alterada com sucesso' };
  }

  /**
   * Lista sessões ativas do cliente
   */
  async getActiveSessions(clientId: string) {
    const sessions = await this.prisma.clientRefreshToken.findMany({
      where: {
        clientId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions;
  }

  /**
   * Revoga uma sessão específica
   */
  async revokeSession(sessionId: string, clientId: string): Promise<void> {
    await this.prisma.clientRefreshToken.updateMany({
      where: { id: sessionId, clientId },
      data: { isRevoked: true },
    });
  }

  // ============================================================================
  // MÉTODOS PRIVADOS
  // ============================================================================

  private async generateAuthResponse(
    client: any,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<ClientAuthResponse> {
    const tokens = await this.generateTokens(
      client.id,
      client.email,
      client.tenantId,
      userAgent,
      ipAddress,
    );

    return {
      ...tokens,
      client: {
        id: client.id,
        tenantId: client.tenantId,
        email: client.email,
        name: client.name,
        phone: client.phone,
      },
      tenant: {
        id: client.tenant.id,
        name: client.tenant.name,
        slug: client.tenant.slug,
      },
    };
  }

  private async generateTokens(
    clientId: string,
    email: string,
    tenantId: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<ClientTokenResponse> {
    // Usa secret separado para clientes se configurado
    const secret =
      this.configService.get('CLIENT_JWT_SECRET') ||
      this.configService.get('JWT_SECRET') ||
      'fallback-secret';

    const accessToken = this.jwtService.sign(
      {
        sub: clientId,
        email,
        tenantId,
        type: 'CLIENT',
      },
      {
        secret,
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.clientRefreshToken.create({
      data: {
        clientId,
        token: refreshToken,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };
  }

  private async revokeAllClientTokens(clientId: string): Promise<void> {
    await this.prisma.clientRefreshToken.updateMany({
      where: { clientId },
      data: { isRevoked: true },
    });
  }
}
