import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateBusinessDto } from './dto/business.dto';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  async getBusinessInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        businessName: true,
        slug: true,
        logo: true,
        description: true,
        address: true,
        phone: true,
        whatsapp: true,
        instagram: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async updateBusiness(userId: string, dto: UpdateBusinessDto) {
    if (dto.slug) {
      const existing = await this.prisma.user.findFirst({
        where: {
          slug: dto.slug,
          NOT: { id: userId },
        },
      });

      if (existing) {
        throw new ConflictException('Este link já está em uso');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        businessName: true,
        slug: true,
        logo: true,
        description: true,
        address: true,
        phone: true,
        whatsapp: true,
        instagram: true,
      },
    });
  }

  async updateLogo(userId: string, logoUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { logo: logoUrl },
      select: {
        id: true,
        logo: true,
      },
    });
  }

  async generateSlug(businessName: string): Promise<string> {
    const baseSlug = businessName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    let slug = baseSlug;
    let counter = 1;

    while (await this.prisma.user.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }
}
