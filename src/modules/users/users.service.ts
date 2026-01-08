import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { tenant: true },
    });
  }

  async findByIdWithTenant(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { tenant: true },
    });
  }

  async create(data: {
    tenantId: string;
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    phone?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        tenantId: data.tenantId,
        email: data.email,
        password: data.password,
        name: data.name,
        role: data.role || UserRole.ADMIN,
        phone: data.phone,
      },
      include: { tenant: true },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      phone?: string;
    },
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Lista todos os usuários de um tenant
   */
  async findAllByTenant(tenantId: string): Promise<Omit<User, 'password'>[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return users.map(({ password, ...user }) => user);
  }

  /**
   * Busca um usuário específico de um tenant
   */
  async findByIdInTenant(
    id: string,
    tenantId: string,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Cria um novo usuário para um tenant existente
   */
  async createForTenant(
    tenantId: string,
    dto: CreateUserDto,
    currentUserRole: UserRole,
  ): Promise<Omit<User, 'password'>> {
    // Verifica se o email já existe
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Este email já está em uso');
    }

    // Verifica se o usuário pode criar o role especificado
    if (!this.canManageRole(currentUserRole, dto.role)) {
      throw new ForbiddenException(
        'Você não tem permissão para criar usuários com este perfil',
      );
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: dto.role,
        phone: dto.phone,
      },
    });

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Atualiza um usuário
   */
  async updateInTenant(
    id: string,
    tenantId: string,
    dto: UpdateUserDto,
    currentUserId: string,
    currentUserRole: UserRole,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    // Não pode editar SUPER_ADMIN
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Não é possível editar um Super Admin',
      );
    }

    // Verifica permissão para alterar role
    if (dto.role && !this.canManageRole(currentUserRole, dto.role)) {
      throw new ForbiddenException(
        'Você não tem permissão para definir este perfil',
      );
    }

    // Não pode desativar a si mesmo
    if (dto.isActive === false && id === currentUserId) {
      throw new BadRequestException('Você não pode desativar sua própria conta');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        role: dto.role,
        isActive: dto.isActive,
      },
    });

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Desativa um usuário (soft delete)
   */
  async deactivate(
    id: string,
    tenantId: string,
    currentUserId: string,
  ): Promise<Omit<User, 'password'>> {
    if (id === currentUserId) {
      throw new BadRequestException('Você não pode desativar sua própria conta');
    }

    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Não é possível desativar um Super Admin');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Reativa um usuário
   */
  async reactivate(
    id: string,
    tenantId: string,
  ): Promise<Omit<User, 'password'>> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  /**
   * Reseta a senha de um usuário (admin)
   */
  async resetPassword(
    id: string,
    tenantId: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Não é possível resetar a senha de um Super Admin',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  /**
   * Altera a própria senha
   */
  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new BadRequestException('Senha atual incorreta');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
  }

  /**
   * Verifica se um role pode gerenciar outro role
   */
  private canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      [UserRole.SUPER_ADMIN]: 5,
      [UserRole.ADMIN]: 4,
      [UserRole.MANAGER]: 3,
      [UserRole.OPERATOR]: 2,
      [UserRole.PROVIDER]: 1,
    };

    // Não pode criar SUPER_ADMIN
    if (targetRole === UserRole.SUPER_ADMIN) {
      return false;
    }

    // Precisa ter hierarquia maior que o target
    return roleHierarchy[managerRole] > roleHierarchy[targetRole];
  }
}
