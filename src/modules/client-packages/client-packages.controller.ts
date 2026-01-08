import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ClientPackagesService } from './client-packages.service';
import {
  CreatePackageTemplateDto,
  UpdatePackageTemplateDto,
  QueryPackageTemplatesDto,
  SellPackageDto,
  UpdateClientPackageDto,
  RegisterPaymentDto,
  QueryClientPackagesDto,
  RegisterUsageDto,
  CancelUsageDto,
  QueryUsagesDto,
  TransferPackageDto,
} from './dto/client-packages.dto';

// ============================================================================
// Controller de Templates de Pacotes
// ============================================================================
@Controller('package-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackageTemplatesController {
  constructor(private readonly packagesService: ClientPackagesService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  async create(@Request() req, @Body() dto: CreatePackageTemplateDto) {
    return this.packagesService.createTemplate(req.user.tenantId, dto);
  }

  @Get()
  async findAll(@Request() req, @Query() query: QueryPackageTemplatesDto) {
    return this.packagesService.listTemplates(req.user.tenantId, query);
  }

  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.packagesService.getTemplate(req.user.tenantId, id);
  }

  @Put(':id')
  @Roles('ADMIN', 'MANAGER')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackageTemplateDto,
  ) {
    return this.packagesService.updateTemplate(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.packagesService.deleteTemplate(req.user.tenantId, id);
    return { message: 'Template de pacote removido com sucesso' };
  }
}

// ============================================================================
// Controller de Pacotes de Clientes
// ============================================================================
@ApiTags('Client Packages')
@ApiBearerAuth('access-token')
@Controller('client-packages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientPackagesController {
  constructor(private readonly packagesService: ClientPackagesService) {}

  // --------------------------------------------------------------------------
  // Venda e Gestão de Pacotes
  // --------------------------------------------------------------------------

  @Post('sell')
  @Roles('ADMIN', 'MANAGER', 'OPERATOR')
  async sell(@Request() req, @Body() dto: SellPackageDto) {
    return this.packagesService.sellPackage(
      req.user.tenantId,
      req.user.userId,
      dto,
    );
  }

  @Get()
  async findAll(@Request() req, @Query() query: QueryClientPackagesDto) {
    return this.packagesService.listClientPackages(req.user.tenantId, query);
  }

  @Get('expiring')
  async findExpiring(@Request() req) {
    return this.packagesService.listClientPackages(req.user.tenantId, {
      expiringSoon: true,
    });
  }

  @Get('with-balance')
  async findWithBalance(@Request() req) {
    return this.packagesService.listClientPackages(req.user.tenantId, {
      hasBalance: true,
    });
  }

  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.packagesService.getClientPackage(req.user.tenantId, id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'MANAGER')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientPackageDto,
  ) {
    return this.packagesService.updateClientPackage(req.user.tenantId, id, dto);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'MANAGER')
  async cancel(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason?: string,
  ) {
    return this.packagesService.cancelClientPackage(
      req.user.tenantId,
      id,
      reason,
    );
  }

  // --------------------------------------------------------------------------
  // Pagamentos
  // --------------------------------------------------------------------------

  @Post(':id/payments')
  @Roles('ADMIN', 'MANAGER', 'OPERATOR')
  async registerPayment(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterPaymentDto,
  ) {
    return this.packagesService.registerPayment(
      req.user.tenantId,
      id,
      req.user.userId,
      dto,
    );
  }

  // --------------------------------------------------------------------------
  // Transferência
  // --------------------------------------------------------------------------

  @Post(':id/transfer')
  @Roles('ADMIN', 'MANAGER')
  async transfer(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferPackageDto,
  ) {
    return this.packagesService.transferPackage(
      req.user.tenantId,
      id,
      req.user.userId,
      dto,
    );
  }
}

// ============================================================================
// Controller de Uso de Pacotes
// ============================================================================
@Controller('package-usages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackageUsagesController {
  constructor(private readonly packagesService: ClientPackagesService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER', 'OPERATOR', 'PROVIDER')
  async register(@Request() req, @Body() dto: RegisterUsageDto) {
    return this.packagesService.registerUsage(
      req.user.tenantId,
      req.user.userId,
      dto,
    );
  }

  @Get()
  async findAll(@Request() req, @Query() query: QueryUsagesDto) {
    return this.packagesService.listUsages(req.user.tenantId, query);
  }

  @Post(':id/cancel')
  @Roles('ADMIN', 'MANAGER')
  async cancel(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelUsageDto,
  ) {
    return this.packagesService.cancelUsage(
      req.user.tenantId,
      id,
      req.user.userId,
      dto,
    );
  }
}

// ============================================================================
// Controller de Saldo/Balance do Cliente
// ============================================================================
@Controller('clients/:clientId/package-balance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientPackageBalanceController {
  constructor(private readonly packagesService: ClientPackagesService) {}

  @Get()
  async getBalance(
    @Request() req,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    return this.packagesService.getClientBalance(req.user.tenantId, clientId);
  }
}

// ============================================================================
// Controller de Relatórios de Pacotes
// ============================================================================
@Controller('reports/packages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackageReportsController {
  constructor(private readonly packagesService: ClientPackagesService) {}

  @Get('summary')
  @Roles('ADMIN', 'MANAGER')
  async getSummary(
    @Request() req,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.packagesService.getPackagesSummary(
      req.user.tenantId,
      new Date(startDate),
      new Date(endDate),
    );
  }
}
