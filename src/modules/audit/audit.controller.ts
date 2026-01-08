import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { QueryAuditLogsDto } from './dto/audit.dto';
import { UserRole } from '@prisma/client';

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Lista logs de auditoria com filtros e paginação
   * GET /api/audit
   */
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async findAll(@Req() req: any, @Query() query: QueryAuditLogsDto) {
    return this.auditService.findAll(req.user.tenantId, query);
  }

  /**
   * Obtém estatísticas de auditoria
   * GET /api/audit/stats
   */
  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async getStats(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.getStats(
      req.user.tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * Obtém atividade recente
   * GET /api/audit/recent
   */
  @Get('recent')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async getRecentActivity(
    @Req() req: any,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.getRecentActivity(
      req.user.tenantId,
      limit ? Number(limit) : 20,
    );
  }

  /**
   * Exporta logs de auditoria
   * GET /api/audit/export
   */
  @Get('export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async exportLogs(@Req() req: any, @Query() query: QueryAuditLogsDto) {
    const logs = await this.auditService.exportLogs(req.user.tenantId, query);
    return {
      data: logs,
      exportedAt: new Date().toISOString(),
      total: logs.length,
    };
  }

  /**
   * Busca histórico de uma entidade específica
   * GET /api/audit/entity/:entity/:entityId
   */
  @Get('entity/:entity/:entityId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async findByEntity(
    @Req() req: any,
    @Param('entity') entity: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.auditService.findByEntity(entity, entityId, req.user.tenantId);
  }

  /**
   * Busca histórico de ações de um usuário
   * GET /api/audit/user/:userId
   */
  @Get('user/:userId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async findByUser(
    @Req() req: any,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditService.findByUser(
      userId,
      req.user.tenantId,
      limit ? Number(limit) : 50,
    );
  }

  /**
   * Busca um log específico por ID
   * GET /api/audit/:id
   */
  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER)
  async findOne(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auditService.findOne(id, req.user.tenantId);
  }
}
