import {
  Controller,
  Post,
  Get,
  Body,
  Patch,
  Delete,
  Param,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClientAuthService } from './client-auth.service';
import {
  ClientRegisterDto,
  ClientLoginDto,
  RequestOtpDto,
  VerifyOtpDto,
  ClientRefreshTokenDto,
  ClientForgotPasswordDto,
  ClientResetPasswordDto,
  ClientVerifyResetTokenDto,
  ClientUpdateProfileDto,
  ClientChangePasswordDto,
} from './dto/client-auth.dto';
import { ClientJwtAuthGuard } from '../../common/guards/client-jwt-auth.guard';
import { CurrentClient } from '../../common/decorators/current-client.decorator';

@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  /**
   * Registra um novo cliente
   * POST /client-auth/register
   */
  @Post('register')
  async register(
    @Body() dto: ClientRegisterDto,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: Request,
  ) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    return this.clientAuthService.register(dto, userAgent, ipAddress);
  }

  /**
   * Login com email e senha
   * POST /client-auth/login
   */
  @Post('login')
  async login(
    @Body() dto: ClientLoginDto,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: Request,
  ) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    return this.clientAuthService.login(dto, userAgent, ipAddress);
  }

  /**
   * Solicita código OTP por email
   * POST /client-auth/request-otp
   */
  @Post('request-otp')
  async requestOtp(@Body() dto: RequestOtpDto) {
    return this.clientAuthService.requestOtp(dto);
  }

  /**
   * Verifica OTP e faz login
   * POST /client-auth/verify-otp
   */
  @Post('verify-otp')
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: Request,
  ) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    return this.clientAuthService.verifyOtp(dto, userAgent, ipAddress);
  }

  /**
   * Renova tokens
   * POST /client-auth/refresh
   */
  @Post('refresh')
  async refresh(
    @Body() dto: ClientRefreshTokenDto,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: Request,
  ) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    return this.clientAuthService.refreshTokens(dto.refreshToken, userAgent, ipAddress);
  }

  /**
   * Logout
   * POST /client-auth/logout
   */
  @Post('logout')
  async logout(@Body() dto: ClientRefreshTokenDto) {
    await this.clientAuthService.logout(dto.refreshToken);
    return { message: 'Logout realizado com sucesso' };
  }

  /**
   * Dados do cliente logado
   * GET /client-auth/me
   */
  @Get('me')
  @UseGuards(ClientJwtAuthGuard)
  async me(@CurrentClient() client: any) {
    return this.clientAuthService.me(client.id);
  }

  /**
   * Solicita recuperação de senha
   * POST /client-auth/forgot-password
   */
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ClientForgotPasswordDto) {
    return this.clientAuthService.forgotPassword(dto);
  }

  /**
   * Verifica se token de reset é válido
   * POST /client-auth/verify-reset-token
   */
  @Post('verify-reset-token')
  async verifyResetToken(@Body() dto: ClientVerifyResetTokenDto) {
    return this.clientAuthService.verifyResetToken(dto.token);
  }

  /**
   * Redefine a senha
   * POST /client-auth/reset-password
   */
  @Post('reset-password')
  async resetPassword(@Body() dto: ClientResetPasswordDto) {
    return this.clientAuthService.resetPassword(dto);
  }

  /**
   * Atualiza perfil do cliente
   * PATCH /client-auth/profile
   */
  @Patch('profile')
  @UseGuards(ClientJwtAuthGuard)
  async updateProfile(
    @CurrentClient() client: any,
    @Body() dto: ClientUpdateProfileDto,
  ) {
    return this.clientAuthService.updateProfile(client.id, dto);
  }

  /**
   * Altera senha do cliente
   * POST /client-auth/change-password
   */
  @Post('change-password')
  @UseGuards(ClientJwtAuthGuard)
  async changePassword(
    @CurrentClient() client: any,
    @Body() dto: ClientChangePasswordDto,
  ) {
    return this.clientAuthService.changePassword(client.id, dto);
  }

  /**
   * Lista sessões ativas
   * GET /client-auth/sessions
   */
  @Get('sessions')
  @UseGuards(ClientJwtAuthGuard)
  async getSessions(@CurrentClient() client: any) {
    return this.clientAuthService.getActiveSessions(client.id);
  }

  /**
   * Revoga uma sessão
   * DELETE /client-auth/sessions/:id
   */
  @Delete('sessions/:id')
  @UseGuards(ClientJwtAuthGuard)
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentClient() client: any,
  ) {
    await this.clientAuthService.revokeSession(sessionId, client.id);
    return { message: 'Sessão encerrada' };
  }
}
