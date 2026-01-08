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
import { LocationsService } from './locations.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
  QueryLocationsDto,
  AssignProviderToLocationDto,
  UpdateProviderLocationDto,
  SetLocationInventoryDto,
  AdjustLocationInventoryDto,
  QueryLocationInventoryDto,
  CreateTransferDto,
  UpdateTransferStatusDto,
  QueryTransfersDto,
  ConsolidatedReportQueryDto,
} from './dto/locations.dto';

// ============================================================================
// Controller de Locations (Unidades)
// ============================================================================
@ApiTags('Locations')
@ApiBearerAuth('access-token')
@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // --------------------------------------------------------------------------
  // CRUD de Locations
  // --------------------------------------------------------------------------

  @Post()
  @Roles('ADMIN')
  async create(@Request() req, @Body() dto: CreateLocationDto) {
    return this.locationsService.createLocation(req.user.tenantId, dto);
  }

  @Get()
  async findAll(@Request() req, @Query() query: QueryLocationsDto) {
    return this.locationsService.listLocations(req.user.tenantId, query);
  }

  @Get(':id')
  async findOne(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationsService.getLocation(req.user.tenantId, id);
  }

  @Put(':id')
  @Roles('ADMIN')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.updateLocation(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.locationsService.deleteLocation(req.user.tenantId, id);
    return { message: 'Unidade desativada com sucesso' };
  }

  // --------------------------------------------------------------------------
  // Profissionais por Unidade
  // --------------------------------------------------------------------------

  @Get(':id/providers')
  async getLocationProviders(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationsService.getLocationProviders(req.user.tenantId, id);
  }

  // --------------------------------------------------------------------------
  // Estoque por Unidade
  // --------------------------------------------------------------------------

  @Get(':id/inventory')
  async getLocationInventory(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryLocationInventoryDto,
  ) {
    return this.locationsService.getLocationInventory(
      req.user.tenantId,
      id,
      query,
    );
  }

  @Post(':id/inventory')
  @Roles('ADMIN', 'MANAGER')
  async setLocationInventory(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetLocationInventoryDto,
  ) {
    return this.locationsService.setLocationInventory(
      req.user.tenantId,
      id,
      dto,
    );
  }

  @Post(':id/inventory/adjust')
  @Roles('ADMIN', 'MANAGER')
  async adjustLocationInventory(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustLocationInventoryDto,
  ) {
    return this.locationsService.adjustLocationInventory(
      req.user.tenantId,
      id,
      dto,
    );
  }
}

// ============================================================================
// Controller de Provider-Location Assignments
// ============================================================================
@Controller('provider-locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProviderLocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles('ADMIN')
  async assign(@Request() req, @Body() dto: AssignProviderToLocationDto) {
    return this.locationsService.assignProviderToLocation(
      req.user.tenantId,
      dto,
    );
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderLocationDto,
  ) {
    return this.locationsService.updateProviderLocation(
      req.user.tenantId,
      id,
      dto,
    );
  }

  @Delete(':id')
  @Roles('ADMIN')
  async remove(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.locationsService.removeProviderFromLocation(
      req.user.tenantId,
      id,
    );
    return { message: 'Profissional removido da unidade' };
  }

  @Get('provider/:providerId')
  async getByProvider(
    @Request() req,
    @Param('providerId', ParseUUIDPipe) providerId: string,
  ) {
    return this.locationsService.getProviderLocations(
      req.user.tenantId,
      providerId,
    );
  }
}

// ============================================================================
// Controller de Transferências entre Unidades
// ============================================================================
@Controller('transfers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransfersController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles('ADMIN', 'MANAGER')
  async create(@Request() req, @Body() dto: CreateTransferDto) {
    return this.locationsService.createTransfer(
      req.user.tenantId,
      req.user.userId,
      dto,
    );
  }

  @Get()
  async findAll(@Request() req, @Query() query: QueryTransfersDto) {
    return this.locationsService.listTransfers(req.user.tenantId, query);
  }

  @Patch(':id/status')
  @Roles('ADMIN', 'MANAGER')
  async updateStatus(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransferStatusDto,
  ) {
    return this.locationsService.updateTransferStatus(
      req.user.tenantId,
      id,
      req.user.userId,
      dto,
    );
  }
}

// ============================================================================
// Controller de Relatórios Consolidados Multi-Unidade
// ============================================================================
@Controller('reports/consolidated')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsolidatedReportsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('dashboard')
  @Roles('ADMIN', 'MANAGER')
  async getDashboard(@Request() req, @Query() query: ConsolidatedReportQueryDto) {
    return this.locationsService.getConsolidatedDashboard(
      req.user.tenantId,
      query,
    );
  }

  @Get('financial')
  @Roles('ADMIN', 'MANAGER')
  async getFinancialReport(
    @Request() req,
    @Query() query: ConsolidatedReportQueryDto,
  ) {
    return this.locationsService.getConsolidatedFinancialReport(
      req.user.tenantId,
      query,
    );
  }

  @Get('inventory')
  @Roles('ADMIN', 'MANAGER')
  async getInventoryReport(
    @Request() req,
    @Query() query: ConsolidatedReportQueryDto,
  ) {
    return this.locationsService.getConsolidatedInventoryReport(
      req.user.tenantId,
      query,
    );
  }
}
