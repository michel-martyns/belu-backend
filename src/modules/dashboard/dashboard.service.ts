import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService, CACHE_KEYS, CACHE_TTL } from '../../redis';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async getToday(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        client: true,
        provider: true,
        service: true,
      },
      orderBy: { startTime: 'asc' },
    });

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const upcoming = appointments.filter(
      (a) =>
        a.startTime >= currentTime &&
        a.status !== AppointmentStatus.CANCELLED &&
        a.status !== AppointmentStatus.COMPLETED,
    );

    const completed = appointments.filter(
      (a) => a.status === AppointmentStatus.COMPLETED,
    );

    const totalValue = appointments
      .filter((a) => a.status !== AppointmentStatus.CANCELLED)
      .reduce((sum, a) => sum + Number(a.price), 0);

    const completedValue = completed.reduce(
      (sum, a) => sum + Number(a.price),
      0,
    );

    return {
      date: today.toISOString().split('T')[0],
      appointments: appointments.length,
      upcoming: upcoming.length,
      completed: completed.length,
      cancelled: appointments.filter(
        (a) => a.status === AppointmentStatus.CANCELLED,
      ).length,
      totalValue,
      completedValue,
      nextAppointments: upcoming.slice(0, 5),
    };
  }

  async getWeek(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        date: {
          gte: startOfWeek,
          lt: endOfWeek,
        },
      },
      include: {
        service: true,
      },
    });

    const byDay = Array(7)
      .fill(null)
      .map((_, i) => {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];

        const dayAppointments = appointments.filter(
          (a) => a.date.toISOString().split('T')[0] === dateStr,
        );

        return {
          date: dateStr,
          dayOfWeek: i,
          appointments: dayAppointments.length,
          value: dayAppointments
            .filter((a) => a.status !== AppointmentStatus.CANCELLED)
            .reduce((sum, a) => sum + Number(a.price), 0),
        };
      });

    const totalValue = appointments
      .filter((a) => a.status !== AppointmentStatus.CANCELLED)
      .reduce((sum, a) => sum + Number(a.price), 0);

    return {
      startDate: startOfWeek.toISOString().split('T')[0],
      endDate: endOfWeek.toISOString().split('T')[0],
      appointments: appointments.length,
      totalValue,
      byDay,
    };
  }

  async getMonth(tenantId: string) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
    });

    const completed = appointments.filter(
      (a) => a.status === AppointmentStatus.COMPLETED,
    );

    const totalValue = appointments
      .filter((a) => a.status !== AppointmentStatus.CANCELLED)
      .reduce((sum, a) => sum + Number(a.price), 0);

    const completedValue = completed.reduce(
      (sum, a) => sum + Number(a.price),
      0,
    );

    const topServices = await this.prisma.appointment.groupBy({
      by: ['serviceId'],
      where: {
        tenantId,
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
        status: { not: AppointmentStatus.CANCELLED },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const serviceIds = topServices.map((s) => s.serviceId);
    const services = await this.prisma.service.findMany({
      where: { id: { in: serviceIds } },
    });

    const topServicesWithNames = topServices.map((s) => ({
      serviceId: s.serviceId,
      serviceName: services.find((sv) => sv.id === s.serviceId)?.name || '',
      count: s._count.id,
    }));

    return {
      month: today.getMonth() + 1,
      year: today.getFullYear(),
      appointments: appointments.length,
      completed: completed.length,
      cancelled: appointments.filter(
        (a) => a.status === AppointmentStatus.CANCELLED,
      ).length,
      totalValue,
      completedValue,
      topServices: topServicesWithNames,
    };
  }

  async getOverview(tenantId: string) {
    const cacheKey = CACHE_KEYS.DASHBOARD(tenantId);

    return this.redis.getOrSet(
      cacheKey,
      async () => {
        const [clients, services, providers, appointments] = await Promise.all([
          this.prisma.client.count({ where: { tenantId } }),
          this.prisma.service.count({ where: { tenantId, active: true } }),
          this.prisma.provider.count({ where: { tenantId, active: true } }),
          this.prisma.appointment.count({ where: { tenantId } }),
        ]);

        return {
          clients,
          services,
          providers,
          appointments,
        };
      },
      CACHE_TTL.MEDIUM, // 5 minutos
    );
  }
}
