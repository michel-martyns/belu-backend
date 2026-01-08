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
import { TenantService } from '../tenant/tenant.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { RegisterDto, LoginDto, AuthResponse, TokenResponse } from './dto/auth.dto';
import { UserRole } from '@prisma/client';

// Constantes de expiração
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutos em segundos
const REFRESH_TOKEN_EXPIRY_DAYS = 15; // 15 dias - sessão mantida por mais tempo
const PASSWORD_RESET_EXPIRY_HOURS = 1; // 1 hora

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private tenantService: TenantService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  /**
   * Registra um novo usuário e cria um tenant para ele
   */
  async register(
    dto: RegisterDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponse> {
    // Verifica se o email já existe
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    // Gera ou valida o slug
    let slug = dto.slug;
    if (slug) {
      const isAvailable = await this.tenantService.isSlugAvailable(slug);
      if (!isAvailable) {
        throw new ConflictException('Este slug já está em uso');
      }
    } else {
      slug = await this.tenantService.generateUniqueSlug(dto.businessName);
    }

    // Cria tenant + user em uma transação
    const result = await this.prisma.$transaction(async (tx) => {
      // Cria o tenant
      const tenant = await tx.tenant.create({
        data: {
          name: dto.businessName,
          slug: slug!.toLowerCase(),
        },
      });

      // Hash da senha
      const hashedPassword = await bcrypt.hash(dto.password, 10);

      // Cria o usuário admin do tenant
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          role: UserRole.ADMIN,
          phone: dto.phone,
          businessName: dto.businessName, // Campo legado para compatibilidade
        },
      });

      return { tenant, user };
    });

    // Gera os tokens
    const tokens = await this.generateTokens(
      result.user.id,
      result.user.email,
      result.tenant.id,
      result.user.role,
      userAgent,
      ipAddress,
    );

    return {
      ...tokens,
      user: {
        id: result.user.id,
        tenantId: result.tenant.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        phone: result.user.phone ?? undefined,
      },
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
        plan: result.tenant.plan,
      },
    };
  }

  /**
   * Realiza login do usuário
   */
  async login(
    dto: LoginDto,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Sua conta está desativada');
    }

    if (!user.tenant.isActive) {
      throw new UnauthorizedException(
        'Sua clínica está desativada. Entre em contato com o suporte.',
      );
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // Gera os tokens
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.tenantId,
      user.role,
      userAgent,
      ipAddress,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone ?? undefined,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        plan: user.tenant.plan,
      },
    };
  }

  /**
   * Valida o usuário a partir do token JWT
   */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user || !user.isActive || !user.tenant.isActive) {
      throw new UnauthorizedException('Usuário não encontrado ou inativo');
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
    };
  }

  /**
   * Retorna os dados do usuário atual
   */
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    return {
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        plan: user.tenant.plan,
      },
    };
  }

  /**
   * Verifica se um slug está disponível
   */
  async checkSlug(slug: string): Promise<{ available: boolean }> {
    const available = await this.tenantService.isSlugAvailable(slug);
    return { available };
  }

  /**
   * Renova os tokens usando o refresh token
   */
  async refreshTokens(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse> {
    // Busca o refresh token no banco
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: { tenant: true },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Token inválido');
    }

    if (storedToken.isRevoked) {
      // Token foi revogado - possível tentativa de reutilização
      // Revoga todos os tokens do usuário por segurança
      await this.revokeAllUserTokens(storedToken.userId);
      throw new UnauthorizedException('Token revogado');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token expirado');
    }

    if (!storedToken.user.isActive || !storedToken.user.tenant.isActive) {
      throw new UnauthorizedException('Usuário ou tenant desativado');
    }

    // Revoga o token atual (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Gera novos tokens
    return this.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.tenantId,
      storedToken.user.role,
      userAgent,
      ipAddress,
    );
  }

  /**
   * Realiza logout revogando o refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { isRevoked: true },
    });
  }

  /**
   * Revoga todos os tokens de um usuário (logout de todos os dispositivos)
   */
  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllUserTokens(userId);
  }

  /**
   * Lista todas as sessões ativas do usuário
   */
  async getActiveSessions(userId: string) {
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
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
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId },
      data: { isRevoked: true },
    });
  }

  /**
   * Gera access token e refresh token
   */
  private async generateTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: UserRole,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<TokenResponse> {
    // Gera access token JWT
    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        tenantId,
        role,
      },
      {
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    );

    // Gera refresh token (string aleatória segura)
    const refreshToken = crypto.randomBytes(64).toString('hex');

    // Calcula data de expiração do refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    // Salva refresh token no banco
    await this.prisma.refreshToken.create({
      data: {
        userId,
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

  /**
   * Revoga todos os tokens de um usuário
   */
  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  /**
   * Solicita recuperação de senha
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Sempre retorna sucesso para não expor se o email existe
    if (!user || !user.isActive) {
      return {
        message:
          'Se este email estiver cadastrado, você receberá um link para redefinir sua senha.',
      };
    }

    // Invalida tokens anteriores
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Gera novo token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_EXPIRY_HOURS);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Envia email
    const frontendUrl = this.configService.get('FRONTEND_URL', 'http://localhost:3000');
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    await this.emailService.sendPasswordResetEmail(user.email, user.name, resetLink);

    return {
      message:
        'Se este email estiver cadastrado, você receberá um link para redefinir sua senha.',
    };
  }

  /**
   * Verifica se o token de reset é válido
   */
  async verifyResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return { valid: false };
    }

    if (resetToken.usedAt) {
      return { valid: false };
    }

    if (resetToken.expiresAt < new Date()) {
      return { valid: false };
    }

    if (!resetToken.user.isActive) {
      return { valid: false };
    }

    return {
      valid: true,
      email: this.maskEmail(resetToken.user.email),
    };
  }

  /**
   * Reseta a senha usando o token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Token inválido ou expirado');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Este link já foi utilizado');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Token expirado. Solicite um novo link.');
    }

    if (!resetToken.user.isActive) {
      throw new BadRequestException('Usuário não encontrado');
    }

    // Atualiza a senha
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      // Marca token como usado
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      // Atualiza senha do usuário
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      // Revoga todos os refresh tokens (força re-login)
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId },
        data: { isRevoked: true },
      }),
    ]);

    // Envia email de confirmação
    await this.emailService.sendPasswordChangedEmail(
      resetToken.user.email,
      resetToken.user.name,
    );

    return { message: 'Senha alterada com sucesso' };
  }

  /**
   * Mascara o email para exibição
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    const maskedLocal =
      local.length > 3
        ? local.substring(0, 2) + '***' + local.substring(local.length - 1)
        : local.substring(0, 1) + '***';
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Limpa tokens expirados (deve ser chamado periodicamente)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const [refreshResult, resetResult] = await Promise.all([
      this.prisma.refreshToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: new Date() } }, { isRevoked: true }],
        },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
        },
      }),
    ]);
    return refreshResult.count + resetResult.count;
  }
}
