import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  ResetUserPasswordDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PlanLimitGuard } from '../../common/guards/plan.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CheckPlanLimit } from '../../common/decorators/plan-feature.decorator';
import { Permission } from '../../common/permissions/permissions';
import type { CurrentUserData } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USERS_VIEW)
  async findAll(@CurrentUser() user: CurrentUserData) {
    return this.usersService.findAllByTenant(user.tenantId);
  }

  @Get('me')
  async getProfile(@CurrentUser() user: CurrentUserData) {
    return this.usersService.findByIdInTenant(user.id, user.tenantId);
  }

  @Get(':id')
  @RequirePermissions(Permission.USERS_VIEW)
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.findByIdInTenant(id, user.tenantId);
  }

  @Post()
  @UseGuards(PlanLimitGuard)
  @RequirePermissions(Permission.USERS_CREATE)
  @CheckPlanLimit('maxUsers')
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.createForTenant(user.tenantId, dto, user.role);
  }

  @Patch('me')
  async updateProfile(
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    // Usuário só pode alterar nome e telefone do próprio perfil
    return this.usersService.updateInTenant(
      user.id,
      user.tenantId,
      { name: dto.name, phone: dto.phone },
      user.id,
      user.role,
    );
  }

  @Patch('me/password')
  async changeOwnPassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.usersService.changeOwnPassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
    return { message: 'Senha alterada com sucesso' };
  }

  @Patch(':id')
  @RequirePermissions(Permission.USERS_EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.updateInTenant(
      id,
      user.tenantId,
      dto,
      user.id,
      user.role,
    );
  }

  @Patch(':id/reset-password')
  @RequirePermissions(Permission.USERS_EDIT)
  async resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.usersService.resetPassword(id, user.tenantId, dto.newPassword);
    return { message: 'Senha resetada com sucesso' };
  }

  @Patch(':id/reactivate')
  @RequirePermissions(Permission.USERS_EDIT)
  async reactivate(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.reactivate(id, user.tenantId);
  }

  @Delete(':id')
  @RequirePermissions(Permission.USERS_DELETE)
  async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.deactivate(id, user.tenantId, user.id);
  }
}
