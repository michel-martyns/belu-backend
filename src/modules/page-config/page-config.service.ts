import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpdatePageConfigDto,
  UpdateSectionsDto,
  PAGE_TEMPLATES,
  PageSection,
} from './dto/page-config.dto';

@Injectable()
export class PageConfigService {
  constructor(private prisma: PrismaService) {}

  // Buscar configuração do tenant
  async getConfig(tenantId: string) {
    let config = await this.prisma.pageConfig.findUnique({
      where: { tenantId },
    });

    // Se não existir, criar com template padrão
    if (!config) {
      config = await this.createDefaultConfig(tenantId);
    }

    return config;
  }

  // Criar configuração padrão
  async createDefaultConfig(tenantId: string) {
    const defaultTemplate = PAGE_TEMPLATES.default;

    return this.prisma.pageConfig.create({
      data: {
        tenantId,
        templateId: defaultTemplate.id,
        sections: defaultTemplate.sections as unknown as any,
        primaryColor: defaultTemplate.primaryColor,
        secondaryColor: defaultTemplate.secondaryColor,
      },
    });
  }

  // Atualizar configuração completa
  async updateConfig(tenantId: string, dto: UpdatePageConfigDto) {
    // Verificar se existe, se não, criar
    const existing = await this.prisma.pageConfig.findUnique({
      where: { tenantId },
    });

    if (!existing) {
      await this.createDefaultConfig(tenantId);
    }

    return this.prisma.pageConfig.update({
      where: { tenantId },
      data: {
        templateId: dto.templateId,
        sections: dto.sections as unknown as any,
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        heroBackgroundImage: dto.heroBackgroundImage,
        isPublished: dto.isPublished,
      },
    });
  }

  // Atualizar apenas seções
  async updateSections(tenantId: string, dto: UpdateSectionsDto) {
    const existing = await this.prisma.pageConfig.findUnique({
      where: { tenantId },
    });

    if (!existing) {
      await this.createDefaultConfig(tenantId);
    }

    return this.prisma.pageConfig.update({
      where: { tenantId },
      data: {
        sections: dto.sections as unknown as any,
      },
    });
  }

  // Aplicar template
  async applyTemplate(tenantId: string, templateId: string) {
    const template = PAGE_TEMPLATES[templateId as keyof typeof PAGE_TEMPLATES];

    if (!template) {
      throw new NotFoundException(`Template "${templateId}" não encontrado`);
    }

    // Verificar se existe, se não, criar
    const existing = await this.prisma.pageConfig.findUnique({
      where: { tenantId },
    });

    if (!existing) {
      return this.prisma.pageConfig.create({
        data: {
          tenantId,
          templateId: template.id,
          sections: template.sections as unknown as any,
          primaryColor: template.primaryColor,
          secondaryColor: template.secondaryColor,
        },
      });
    }

    return this.prisma.pageConfig.update({
      where: { tenantId },
      data: {
        templateId: template.id,
        sections: template.sections as unknown as any,
        primaryColor: template.primaryColor,
        secondaryColor: template.secondaryColor,
      },
    });
  }

  // Listar templates disponíveis
  getTemplates() {
    return Object.values(PAGE_TEMPLATES).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      primaryColor: t.primaryColor,
      secondaryColor: t.secondaryColor,
    }));
  }

  // Buscar configuração pública (por slug)
  async getPublicConfig(slug: string) {
    // Buscar tenant pelo slug
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!tenant) {
      return null;
    }

    const config = await this.prisma.pageConfig.findUnique({
      where: { tenantId: tenant.id },
    });

    // Se não publicado ou não existir, retornar null (frontend usa layout padrão)
    if (!config || !config.isPublished) {
      return null;
    }

    return config;
  }
}
