import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import {
  CreatePlanDto,
  UpdatePlanDto,
  CreatePlanLimitDto,
  UpdatePlanLimitDto,
  CreatePlanFeatureDto,
  UpdatePlanFeatureDto,
  CreateFullPlanDto,
  SubscribePlanDto,
  ChangePlanDto,
  CancelSubscriptionDto,
  QueryPlansDto,
  CheckLimitDto,
  CheckFeatureDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';

// ============================================================================
// Controller Público - Planos e Preços
// ============================================================================

@ApiTags('Plans')
@ApiBearerAuth('access-token')
@Controller('plans')
export class PlansPublicController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * Lista planos públicos disponíveis (para página de preços)
   */
  @Get()
  getPublicPlans() {
    return this.plansService.getPublicPlans();
  }

  /**
   * Comparativo de planos
   */
  @Get('compare')
  comparePlans() {
    return this.plansService.comparePlans();
  }
}

// ============================================================================
// Controller Autenticado - Assinatura do Tenant
// ============================================================================

@Controller('subscription')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * Obter assinatura atual do tenant
   */
  @Get()
  @RequirePermissions(Permission.SETTINGS_VIEW)
  getSubscription(@Request() req) {
    return this.plansService.getSubscription(req.user.tenantId);
  }

  /**
   * Obter uso atual de recursos
   */
  @Get('usage')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  getUsage(@Request() req) {
    return this.plansService.getAllUsage(req.user.tenantId);
  }

  /**
   * Verificar limite de um recurso específico
   */
  @Post('check-limit')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  checkLimit(@Request() req, @Body() dto: CheckLimitDto) {
    return this.plansService.checkLimit(req.user.tenantId, dto);
  }

  /**
   * Verificar se feature está disponível
   */
  @Post('check-feature')
  @RequirePermissions(Permission.SETTINGS_VIEW)
  checkFeature(@Request() req, @Body() dto: CheckFeatureDto) {
    return this.plansService.checkFeature(req.user.tenantId, dto);
  }

  /**
   * Assinar um plano
   */
  @Post('subscribe')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  subscribeToPlan(@Request() req, @Body() dto: SubscribePlanDto) {
    return this.plansService.subscribeToPlan(req.user.tenantId, dto);
  }

  /**
   * Mudar de plano (upgrade/downgrade)
   */
  @Post('change')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  changePlan(@Request() req, @Body() dto: ChangePlanDto) {
    return this.plansService.changePlan(req.user.tenantId, dto);
  }

  /**
   * Cancelar assinatura
   */
  @Post('cancel')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  cancelSubscription(@Request() req, @Body() dto: CancelSubscriptionDto) {
    return this.plansService.cancelSubscription(req.user.tenantId, dto);
  }

  /**
   * Reativar assinatura cancelada
   */
  @Post('reactivate')
  @RequirePermissions(Permission.SETTINGS_EDIT)
  reactivateSubscription(@Request() req) {
    return this.plansService.reactivateSubscription(req.user.tenantId);
  }
}

// ============================================================================
// Controller Admin - Gestão de Planos (Super Admin)
// ============================================================================

@Controller('admin/plans')
@UseGuards(JwtAuthGuard)
export class PlansAdminController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * Listar todos os planos (incluindo inativos)
   */
  @Get()
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  findAll(@Query() query: QueryPlansDto) {
    return this.plansService.findAllPlans(query);
  }

  /**
   * Obter plano por ID
   */
  @Get(':id')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  findById(@Param('id') id: string) {
    return this.plansService.findPlanById(id);
  }

  /**
   * Criar plano
   */
  @Post()
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  createPlan(@Body() dto: CreatePlanDto) {
    return this.plansService.createPlan(dto);
  }

  /**
   * Criar plano completo (com limites e features)
   */
  @Post('full')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  createFullPlan(@Body() dto: CreateFullPlanDto) {
    return this.plansService.createFullPlan(dto);
  }

  /**
   * Atualizar plano
   */
  @Patch(':id')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.updatePlan(id, dto);
  }

  /**
   * Atualizar limites do plano
   */
  @Patch(':id/limits')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  updateLimits(@Param('id') id: string, @Body() dto: UpdatePlanLimitDto) {
    return this.plansService.updatePlanLimits(id, dto);
  }

  /**
   * Adicionar feature ao plano
   */
  @Post(':id/features')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  addFeature(@Param('id') id: string, @Body() dto: CreatePlanFeatureDto) {
    return this.plansService.addPlanFeature(id, dto);
  }

  /**
   * Atualizar feature
   */
  @Patch('features/:featureId')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  updateFeature(
    @Param('featureId') featureId: string,
    @Body() dto: UpdatePlanFeatureDto,
  ) {
    return this.plansService.updatePlanFeature(featureId, dto);
  }

  /**
   * Remover feature do plano
   */
  @Delete('features/:featureId')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  removeFeature(@Param('featureId') featureId: string) {
    return this.plansService.removePlanFeature(featureId);
  }

  /**
   * Seed de planos padrão
   */
  @Post('seed')
  @RequirePermissions(Permission.SYSTEM_ADMIN)
  seedPlans() {
    return this.plansService.seedDefaultPlans();
  }
}
