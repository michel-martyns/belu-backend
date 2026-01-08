import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePublicAppointmentDto } from './dto/public.dto';
import { AppointmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PublicService {
  constructor(private prisma: PrismaService) {}

  async getBusinessBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        isActive: true,
      },
    });

    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    return tenant;
  }

  async getServicesForBusiness(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });

    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    return this.prisma.service.findMany({
      where: { tenantId: tenant.id, active: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        duration: true,
        price: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getProvidersForBusiness(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });

    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    return this.prisma.provider.findMany({
      where: { tenantId: tenant.id, active: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        services: {
          include: { service: true },
        },
        schedules: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getAvailableSlots(
    slug: string,
    providerId: string,
    date: string,
    serviceId?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });

    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();

    // Buscar agenda do profissional
    const provider = await this.prisma.provider.findFirst({
      where: { id: providerId, tenantId: tenant.id, active: true },
      include: {
        schedules: {
          where: { dayOfWeek },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('Profissional não encontrado');
    }

    if (provider.schedules.length === 0) {
      return []; // Profissional não trabalha neste dia
    }

    const schedule = provider.schedules[0];

    // Buscar duração do serviço se especificado
    let duration = 30; // duração padrão
    if (serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: serviceId, tenantId: tenant.id },
      });
      if (service) {
        duration = service.duration;
      }
    }

    // Buscar agendamentos existentes
    const existingAppointments = await this.prisma.appointment.findMany({
      where: {
        providerId,
        date: dateObj,
        status: { not: AppointmentStatus.CANCELLED },
      },
      select: {
        startTime: true,
        endTime: true,
      },
    });

    // Gerar slots disponíveis
    const slots: string[] = [];
    const startMinutes = this.parseTime(schedule.startTime);
    const endMinutes = this.parseTime(schedule.endTime);

    for (let time = startMinutes; time + duration <= endMinutes; time += duration) {
      const slotStart = this.formatTime(time);
      const slotEnd = this.formatTime(time + duration);

      // Verificar se conflita com agendamento existente
      const hasConflict = existingAppointments.some((apt) => {
        const aptStart = this.parseTime(apt.startTime);
        const aptEnd = this.parseTime(apt.endTime);
        return time < aptEnd && time + duration > aptStart;
      });

      if (!hasConflict) {
        slots.push(slotStart);
      }
    }

    return slots;
  }

  async createAppointment(slug: string, dto: CreatePublicAppointmentDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });

    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Estabelecimento não encontrado');
    }

    // Validar serviço
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId: tenant.id, active: true },
    });

    if (!service) {
      throw new BadRequestException('Serviço não encontrado');
    }

    // Validar profissional
    const provider = await this.prisma.provider.findFirst({
      where: { id: dto.providerId, tenantId: tenant.id, active: true },
    });

    if (!provider) {
      throw new BadRequestException('Profissional não encontrado');
    }

    // Calcular horário de término
    const endTime = this.calculateEndTime(dto.startTime, service.duration);

    // Verificar disponibilidade
    const existingAppointment = await this.prisma.appointment.findFirst({
      where: {
        providerId: dto.providerId,
        date: new Date(dto.date),
        status: { not: AppointmentStatus.CANCELLED },
        OR: [
          {
            AND: [
              { startTime: { lte: dto.startTime } },
              { endTime: { gt: dto.startTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } },
            ],
          },
        ],
      },
    });

    if (existingAppointment) {
      throw new BadRequestException('Horário não disponível');
    }

    // Criar ou buscar cliente
    let client = await this.prisma.client.findFirst({
      where: {
        tenantId: tenant.id,
        phone: dto.clientPhone,
      },
    });

    if (!client) {
      client = await this.prisma.client.create({
        data: {
          tenantId: tenant.id,
          name: dto.clientName,
          phone: dto.clientPhone,
        },
      });
    }

    // Verificar preço personalizado
    const providerService = await this.prisma.providerService.findUnique({
      where: {
        providerId_serviceId: {
          providerId: dto.providerId,
          serviceId: dto.serviceId,
        },
      },
    });

    const price = providerService?.customPrice ?? service.price;

    // Criar agendamento
    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        providerId: dto.providerId,
        serviceId: dto.serviceId,
        date: new Date(dto.date),
        startTime: dto.startTime,
        endTime,
        price: new Decimal(Number(price)),
        status: AppointmentStatus.SCHEDULED,
      },
      include: {
        service: true,
        provider: true,
      },
    });

    return {
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      service: appointment.service.name,
      provider: appointment.provider.name,
    };
  }

  private calculateEndTime(startTime: string, durationMinutes: number): string {
    const minutes = this.parseTime(startTime);
    return this.formatTime(minutes + durationMinutes);
  }

  private parseTime(time: string): number {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
  }

  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}
