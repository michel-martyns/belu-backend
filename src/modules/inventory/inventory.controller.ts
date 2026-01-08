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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  CreateStockMovementDto,
  StockAdjustmentDto,
  CreateServiceProductDto,
  UpdateServiceProductDto,
  QueryProductsDto,
  QueryStockMovementsDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  // ============================================================================
  // PRODUCT CATEGORIES
  // ============================================================================

  @Get('categories')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async findAllCategories(@CurrentUser() user: CurrentUserData) {
    return this.inventoryService.findAllCategories(user.tenantId);
  }

  @Get('categories/:id')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async findCategoryById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.findCategoryById(id, user.tenantId);
  }

  @Post('categories')
  @RequirePermissions(Permission.INVENTORY_CREATE)
  async createCategory(
    @Body() dto: CreateProductCategoryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.createCategory(user.tenantId, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(Permission.INVENTORY_EDIT)
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateProductCategoryDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.updateCategory(id, user.tenantId, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions(Permission.INVENTORY_EDIT)
  async deleteCategory(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.deleteCategory(id, user.tenantId);
  }

  // ============================================================================
  // PRODUCTS
  // ============================================================================

  @Get('products')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async findAllProducts(
    @Query() query: QueryProductsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.findAllProducts(user.tenantId, query);
  }

  @Get('products/:id')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async findProductById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.findProductById(id, user.tenantId);
  }

  @Post('products')
  @RequirePermissions(Permission.INVENTORY_CREATE)
  async createProduct(
    @Body() dto: CreateProductDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.createProduct(user.tenantId, dto);
  }

  @Patch('products/:id')
  @RequirePermissions(Permission.INVENTORY_EDIT)
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.updateProduct(id, user.tenantId, dto);
  }

  @Delete('products/:id')
  @RequirePermissions(Permission.INVENTORY_EDIT)
  async deleteProduct(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.deleteProduct(id, user.tenantId);
  }

  // ============================================================================
  // STOCK MOVEMENTS
  // ============================================================================

  @Get('movements')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async findAllMovements(
    @Query() query: QueryStockMovementsDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.findAllMovements(user.tenantId, query);
  }

  @Post('movements')
  @RequirePermissions(Permission.INVENTORY_CREATE)
  async createMovement(
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.createMovement(user.tenantId, dto, user.id);
  }

  @Post('movements/adjust')
  @RequirePermissions(Permission.INVENTORY_EDIT)
  async adjustStock(
    @Body() dto: StockAdjustmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.adjustStock(user.tenantId, dto, user.id);
  }

  // ============================================================================
  // SERVICE PRODUCTS (Consumo automático)
  // ============================================================================

  @Get('service-products/:serviceId')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async findServiceProducts(
    @Param('serviceId') serviceId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.findServiceProducts(user.tenantId, serviceId);
  }

  @Post('service-products')
  @RequirePermissions(Permission.INVENTORY_CREATE)
  async createServiceProduct(
    @Body() dto: CreateServiceProductDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.createServiceProduct(user.tenantId, dto);
  }

  @Patch('service-products/:id')
  @RequirePermissions(Permission.INVENTORY_EDIT)
  async updateServiceProduct(
    @Param('id') id: string,
    @Body() dto: UpdateServiceProductDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.updateServiceProduct(id, user.tenantId, dto);
  }

  @Delete('service-products/:id')
  @RequirePermissions(Permission.INVENTORY_EDIT)
  async deleteServiceProduct(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.deleteServiceProduct(id, user.tenantId);
  }

  // ============================================================================
  // CONSUMO AUTOMÁTICO
  // ============================================================================

  @Post('consume/:appointmentId')
  @RequirePermissions(Permission.INVENTORY_CREATE)
  async consumeStockForAppointment(
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.consumeStockForAppointment(
      user.tenantId,
      appointmentId,
      user.id,
    );
  }

  // ============================================================================
  // ALERTAS E RELATÓRIOS
  // ============================================================================

  @Get('alerts/low-stock')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async getLowStockProducts(@CurrentUser() user: CurrentUserData) {
    return this.inventoryService.getLowStockProducts(user.tenantId);
  }

  @Get('summary')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async getStockSummary(@CurrentUser() user: CurrentUserData) {
    return this.inventoryService.getStockSummary(user.tenantId);
  }

  @Get('report/movements')
  @RequirePermissions(Permission.INVENTORY_VIEW)
  async getMovementReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.inventoryService.getMovementReport(
      user.tenantId,
      startDate,
      endDate,
    );
  }
}
