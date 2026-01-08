import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Query,
  Req,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  CheckSlugDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyResetTokenDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar nova clínica', description: 'Cria uma nova clínica e usuário administrador' })
  @ApiResponse({ status: 201, description: 'Clínica registrada com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiResponse({ status: 409, description: 'Email ou slug já existe' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.authService.register(dto, userAgent, ipAddress);
  }

  @Post('login')
  @ApiOperation({ summary: 'Fazer login', description: 'Autentica o usuário e retorna tokens JWT' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.authService.login(dto, userAgent, ipAddress);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renovar token', description: 'Gera novos tokens usando o refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens renovados com sucesso' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido ou expirado' })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;
    return this.authService.refreshTokens(dto.refreshToken, userAgent, ipAddress);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Fazer logout', description: 'Invalida o refresh token atual' })
  @ApiResponse({ status: 204, description: 'Logout realizado com sucesso' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout de todas sessões', description: 'Invalida todos os refresh tokens do usuário' })
  @ApiResponse({ status: 204, description: 'Todas sessões encerradas' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  async logoutAll(@CurrentUser() user: CurrentUserData) {
    await this.authService.logoutAll(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dados do usuário atual', description: 'Retorna informações do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Dados do usuário' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  async me(@CurrentUser() user: CurrentUserData) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Listar sessões ativas', description: 'Retorna todas as sessões ativas do usuário' })
  @ApiResponse({ status: 200, description: 'Lista de sessões' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  async getSessions(@CurrentUser() user: CurrentUserData) {
    return this.authService.getActiveSessions(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revogar sessão', description: 'Encerra uma sessão específica' })
  @ApiResponse({ status: 204, description: 'Sessão revogada' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 404, description: 'Sessão não encontrada' })
  async revokeSession(
    @Param('id') sessionId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.authService.revokeSession(sessionId, user.id);
  }

  @Get('check-slug')
  @ApiOperation({ summary: 'Verificar disponibilidade de slug', description: 'Verifica se um slug está disponível para registro' })
  @ApiResponse({ status: 200, description: 'Status de disponibilidade' })
  async checkSlug(@Query() dto: CheckSlugDto) {
    return this.authService.checkSlug(dto.slug);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar recuperação de senha', description: 'Envia email com link para redefinição de senha' })
  @ApiResponse({ status: 200, description: 'Email enviado (se o email existir)' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('verify-reset-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar token de reset', description: 'Valida se o token de recuperação de senha é válido' })
  @ApiResponse({ status: 200, description: 'Token válido' })
  @ApiResponse({ status: 400, description: 'Token inválido ou expirado' })
  async verifyResetToken(@Body() dto: VerifyResetTokenDto) {
    return this.authService.verifyResetToken(dto.token);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redefinir senha', description: 'Define nova senha usando o token de recuperação' })
  @ApiResponse({ status: 200, description: 'Senha alterada com sucesso' })
  @ApiResponse({ status: 400, description: 'Token inválido ou expirado' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }
}
