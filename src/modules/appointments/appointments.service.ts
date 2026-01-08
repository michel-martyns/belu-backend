import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateStatusDto,
} from './dto/appointment.dto';
import { AppointmentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    filters?: { date?: string; status?: AppointmentStatus; providerId?: string },
  ) {
    const where: any = { tenantId };

    if (filters?.date) {
      where.date = new Date(filters.date);
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.providerId) {
      where.providerId = filters.providerId;
    }

    return this.prisma.appointment.findMany({
      where,
      include: {
        client: true,
        provider: true,
        service: true,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findById(id: string, tenantId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        provider: true,
        service: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    return appointment;
  }

  async create(tenantId: string, dto: CreateAppointmentDto) {
    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, tenantId },
    });

    if (!service) {
      throw new NotFoundException('Serviço não encontrado');
    }

    const endTime = this.calculateEndTime(dto.startTime, service.duration);

    await this.checkConflict(
      dto.providerId,
      new Date(dto.date),
      dto.startTime,
      endTime,
    );

    const providerService = await this.prisma.providerService.findUnique({
      where: {
        providerId_serviceId: {
          providerId: dto.providerId,
          serviceId: dto.serviceId,
        },
      },
    });

    const price = dto.price ?? providerService?.customPrice ?? service.price;

    return this.prisma.appointment.create({
      data: {
        tenantId,
        clientId: dto.clientId,
        providerId: dto.providerId,
        serviceId: dto.serviceId,
        date: new Date(dto.date),
        startTime: dto.startTime,
        endTime,
        price: new Decimal(Number(price)),
        notes: dto.notes,
        status: AppointmentStatus.SCHEDULED,
      },
      include: {
        client: true,
        provider: true,
        service: true,
      },
    });
  }

  async update(id: string, tenantId: string, dto: UpdateAppointmentDto) {
    const existing = await this.findById(id, tenantId);

    let endTime = existing.endTime;
    let duration = 0;

    if (dto.serviceId || dto.startTime) {
      const service = await this.prisma.service.findFirst({
        where: { id: dto.serviceId || existing.serviceId, tenantId },
      });

      if (!service) {
        throw new NotFoundException('Serviço não encontrado');
      }

      duration = service.duration;
      endTime = this.calculateEndTime(
        dto.startTime || existing.startTime,
        duration,
      );
    }

    if (dto.providerId || dto.date || dto.startTime) {
      await this.checkConflict(
        dto.providerId || existing.providerId,
        dto.date ? new Date(dto.date) : existing.date,
        dto.startTime || existing.startTime,
        endTime,
        id,
      );
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        providerId: dto.providerId,
        serviceId: dto.serviceId,
        date: dto.date ? new Date(dto.date) : undefined,
        startTime: dto.startTime,
        endTime: dto.startTime ? endTime : undefined,
        price: dto.price !== undefined ? new Decimal(dto.price) : undefined,
        notes: dto.notes,
      },
      include: {
        client: true,
        provider: true,
        service: true,
      },
    });
  }

  async updateStatus(id: string, tenantId: string, dto: UpdateStatusDto) {
    await this.findById(id, tenantId);

    return this.prisma.appointment.update({
      where: { id },
      data: { status: dto.status },
      include: {
        client: true,
        provider: true,
        service: true,
      },
    });
  }

  async getAvailableSlots(
    tenantId: string,
    providerId: string,
    date: string,
    serviceId?: string,
  ) {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay();

    const schedule = await this.prisma.providerSchedule.findUnique({
      where: {
        providerId_dayOfWeek: {
          providerId,
          dayOfWeek,
        },
      },
    });

    if (!schedule || !schedule.isAvailable) {
      return [];
    }

    let duration = 30;
    if (serviceId) {
      const service = await this.prisma.service.findFirst({
        where: { id: serviceId, tenantId },
      });
      if (service) {
        duration = service.duration;
      }
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        providerId,
        date: dateObj,
        status: { not: AppointmentStatus.CANCELLED },
      },
      select: { startTime: true, endTime: true },
    });

    const slots: string[] = [];
    let currentTime = this.parseTime(schedule.startTime);
    const endTime = this.parseTime(schedule.endTime);

    while (currentTime + duration <= endTime) {
      const slotStart = this.formatTime(currentTime);
      const slotEnd = this.formatTime(currentTime + duration);

      const hasConflict = appointments.some((apt) => {
        const aptStart = this.parseTime(apt.startTime);
        const aptEnd = this.parseTime(apt.endTime);
        return currentTime < aptEnd && currentTime + duration > aptStart;
      });

      if (!hasConflict) {
        slots.push(slotStart);
      }

      currentTime += 30;
    }

    return slots;
  }

  async count(tenantId: string) {
    return this.prisma.appointment.count({
      where: { tenantId },
    });
  }

  private async checkConflict(
    providerId: string,
    date: Date,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ) {
    const where: any = {
      providerId,
      date,
      status: { not: AppointmentStatus.CANCELLED },
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      select: { startTime: true, endTime: true },
    });

    const newStart = this.parseTime(startTime);
    const newEnd = this.parseTime(endTime);

    const hasConflict = appointments.some((apt) => {
      const aptStart = this.parseTime(apt.startTime);
      const aptEnd = this.parseTime(apt.endTime);
      return newStart < aptEnd && newEnd > aptStart;
    });

    if (hasConflict) {
      throw new BadRequestException(
        'Horário conflita com outro agendamento',
      );
    }
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
