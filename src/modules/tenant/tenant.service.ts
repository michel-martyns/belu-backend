import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { PlanType } from '@prisma/client';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cria um novo tenant
   */
  async create(dto: CreateTenantDto) {
    // Verifica se o slug já existe
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.slug },
    });

    if (existingTenant) {
      throw new ConflictException('Este slug já está em uso');
    }

    return this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: dto.slug.toLowerCase(),
        plan: dto.plan || PlanType.FREE,
      },
    });
  }

  /**
   * Busca tenant por ID
   */
  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    return tenant;
  }

  /**
   * Busca tenant por slug
   */
  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: slug.toLowerCase() },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant não encontrado');
    }

    return tenant;
  }

  /**
   * Atualiza um tenant
   */
  async update(id: string, dto: UpdateTenantDto) {
    await this.findById(id);

    // Se está atualizando o slug, verifica se já existe
    if (dto.slug) {
      const existingTenant = await this.prisma.tenant.findFirst({
        where: {
          slug: dto.slug.toLowerCase(),
          id: { not: id },
        },
      });

      if (existingTenant) {
        throw new ConflictException('Este slug já está em uso');
      }
    }

    return this.prisma.tenant.update({
      where: { id },
      data: {
        name: dto.name,
        slug: dto.slug?.toLowerCase(),
        plan: dto.plan,
      },
    });
  }

  /**
   * Desativa um tenant (soft delete)
   */
  async deactivate(id: string) {
    await this.findById(id);

    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Reativa um tenant
   */
  async activate(id: string) {
    await this.findById(id);

    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Verifica se o slug está disponível
   */
  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: slug.toLowerCase(),
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    return !tenant;
  }

  /**
   * Gera um slug único baseado no nome
   */
  async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]+/g, '-') // Substitui caracteres especiais por hífen
      .replace(/^-+|-+$/g, '') // Remove hífens do início e fim
      .substring(0, 40);

    let slug = baseSlug;
    let counter = 1;

    while (!(await this.isSlugAvailable(slug))) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Retorna estatísticas do tenant
   */
  async getStats(tenantId: string) {
    const [users, clients, services, providers, appointments] =
      await Promise.all([
        this.prisma.user.count({ where: { tenantId } }),
        this.prisma.client.count({ where: { tenantId } }),
        this.prisma.service.count({ where: { tenantId } }),
        this.prisma.provider.count({ where: { tenantId } }),
        this.prisma.appointment.count({ where: { tenantId } }),
      ]);

    return {
      users,
      clients,
      services,
      providers,
      appointments,
    };
  }
}
