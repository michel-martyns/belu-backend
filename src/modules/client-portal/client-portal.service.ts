import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentStatus, ClientPackageStatus } from '@prisma/client';

@Injectable()
export class ClientPortalService {
  constructor(private prisma: PrismaService) {}

  /**
   * Dashboard do cliente - estatísticas resumidas
   */
  async getDashboard(clientId: string, tenantId: string) {
    const now = new Date();

    // Busca dados em paralelo
    const [
      totalAppointments,
      upcomingAppointments,
      completedAppointments,
      activePackages,
      nextAppointment,
    ] = await Promise.all([
      // Total de agendamentos
      this.prisma.appointment.count({
        where: { clientId, tenantId },
      }),
      // Agendamentos futuros
      this.prisma.appointment.count({
        where: {
          clientId,
          tenantId,
          date: { gte: now },
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        },
      }),
      // Agendamentos concluídos
      this.prisma.appointment.count({
        where: {
          clientId,
          tenantId,
          status: AppointmentStatus.COMPLETED,
        },
      }),
      // Pacotes ativos
      this.prisma.clientPackage.count({
        where: {
          clientId,
          tenantId,
          status: ClientPackageStatus.ACTIVE,
        },
      }),
      // Próximo agendamento
      this.prisma.appointment.findFirst({
        where: {
          clientId,
          tenantId,
          date: { gte: now },
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
        },
        include: {
          service: { select: { id: true, name: true, duration: true } },
          provider: { select: { id: true, name: true } },
        },
        orderBy: { date: 'asc' },
      }),
    ]);

    return {
      stats: {
        totalAppointments,
        upcomingAppointments,
        completedAppointments,
        activePackages,
      },
      nextAppointment: nextAppointment
        ? {
            id: nextAppointment.id,
            date: nextAppointment.date,
            startTime: nextAppointment.startTime,
            endTime: nextAppointment.endTime,
            status: nextAppointment.status,
            service: nextAppointment.service,
            provider: nextAppointment.provider,
          }
        : null,
    };
  }

  /**
   * Lista agendamentos do cliente
   */
  async getAppointments(
    clientId: string,
    tenantId: string,
    query?: {
      startDate?: string;
      endDate?: string;
      status?: string;
    },
  ) {
    const where: any = {
      clientId,
      tenantId,
    };

    if (query?.startDate) {
      where.date = { ...where.date, gte: new Date(query.startDate) };
    }

    if (query?.endDate) {
      where.date = { ...where.date, lte: new Date(query.endDate) };
    }

    if (query?.status) {
      where.status = query.status as AppointmentStatus;
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      include: {
        service: {
          select: { id: true, name: true, duration: true, price: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    return appointments.map((apt) => ({
      id: apt.id,
      date: apt.date,
      startTime: apt.startTime,
      endTime: apt.endTime,
      status: apt.status,
      notes: apt.notes,
      service: apt.service,
      provider: apt.provider,
      createdAt: apt.createdAt,
    }));
  }

  /**
   * Detalhes de um agendamento
   */
  async getAppointmentById(
    appointmentId: string,
    clientId: string,
    tenantId: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clientId,
        tenantId,
      },
      include: {
        service: {
          select: { id: true, name: true, duration: true, price: true, description: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    return {
      id: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      notes: appointment.notes,
      service: appointment.service,
      provider: appointment.provider,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
    };
  }

  /**
   * Cancela um agendamento
   */
  async cancelAppointment(
    appointmentId: string,
    clientId: string,
    tenantId: string,
    reason?: string,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        clientId,
        tenantId,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    // Verifica se pode cancelar (24h de antecedência)
    const appointmentDate = new Date(appointment.date);
    const now = new Date();
    const hoursUntilAppointment =
      (appointmentDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilAppointment < 24) {
      throw new BadRequestException(
        'Não é possível cancelar agendamentos com menos de 24 horas de antecedência',
      );
    }

    const validStatuses: AppointmentStatus[] = [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED];
    if (!validStatuses.includes(appointment.status)) {
      throw new BadRequestException(
        'Este agendamento não pode ser cancelado',
      );
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.CANCELLED,
        notes: reason
          ? `${appointment.notes || ''}\n[Cancelado pelo cliente: ${reason}]`.trim()
          : appointment.notes,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      message: 'Agendamento cancelado com sucesso',
    };
  }

  /**
   * Lista pacotes do cliente
   */
  async getPackages(clientId: string, tenantId: string) {
    const packages = await this.prisma.clientPackage.findMany({
      where: {
        clientId,
        tenantId,
      },
      include: {
        packageTemplate: {
          select: { id: true, name: true, description: true },
        },
        items: {
          include: {
            service: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      packageTemplate: pkg.packageTemplate,
      status: pkg.status,
      salePrice: pkg.salePrice,
      paidAmount: pkg.paidAmount,
      expiresAt: pkg.expiresAt,
      items: pkg.items.map((item) => ({
        id: item.id,
        service: item.service,
        quantity: item.quantity,
        usedQuantity: item.usedQuantity,
        remainingQuantity: item.quantity - item.usedQuantity,
      })),
      createdAt: pkg.createdAt,
    }));
  }

  /**
   * Detalhes de um pacote
   */
  async getPackageById(packageId: string, clientId: string, tenantId: string) {
    const pkg = await this.prisma.clientPackage.findFirst({
      where: {
        id: packageId,
        clientId,
        tenantId,
      },
      include: {
        packageTemplate: {
          select: { id: true, name: true, description: true },
        },
        items: {
          include: {
            service: {
              select: { id: true, name: true, duration: true, price: true },
            },
          },
        },
        usages: {
          include: {
            clientPackageItem: {
              include: {
                service: {
                  select: { id: true, name: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        transactions: {
          where: { type: 'INCOME' },
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!pkg) {
      throw new NotFoundException('Pacote não encontrado');
    }

    return {
      id: pkg.id,
      name: pkg.name,
      packageTemplate: pkg.packageTemplate,
      status: pkg.status,
      salePrice: pkg.salePrice,
      paidAmount: pkg.paidAmount,
      remainingAmount: Number(pkg.salePrice) - Number(pkg.paidAmount),
      expiresAt: pkg.expiresAt,
      items: pkg.items.map((item) => ({
        id: item.id,
        service: item.service,
        quantity: item.quantity,
        usedQuantity: item.usedQuantity,
        remainingQuantity: item.quantity - item.usedQuantity,
      })),
      usages: pkg.usages.map((usage) => ({
        id: usage.id,
        service: usage.clientPackageItem.service,
        quantity: usage.quantity,
        usedAt: usage.usedAt,
        notes: usage.notes,
      })),
      payments: pkg.transactions.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        paymentMethodId: tx.paymentMethodId,
        date: tx.date,
      })),
      createdAt: pkg.createdAt,
    };
  }

  /**
   * Histórico completo do cliente
   */
  async getHistory(clientId: string, tenantId: string) {
    const [appointments, packages] = await Promise.all([
      // Últimos 50 agendamentos
      this.prisma.appointment.findMany({
        where: { clientId, tenantId },
        include: {
          service: { select: { id: true, name: true } },
          provider: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 50,
      }),
      // Pacotes
      this.prisma.clientPackage.findMany({
        where: { clientId, tenantId },
        include: {
          packageTemplate: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Monta timeline unificada
    const timeline: any[] = [];

    appointments.forEach((apt) => {
      timeline.push({
        type: 'appointment',
        id: apt.id,
        date: apt.date,
        title: apt.service.name,
        subtitle: apt.provider.name,
        status: apt.status,
      });
    });

    packages.forEach((pkg) => {
      timeline.push({
        type: 'package',
        id: pkg.id,
        date: pkg.createdAt,
        title: `Pacote: ${pkg.name}`,
        subtitle: `R$ ${Number(pkg.salePrice).toFixed(2)}`,
        status: pkg.status,
      });
    });

    // Ordena por data
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      appointments: appointments.map((apt) => ({
        id: apt.id,
        date: apt.date,
        startTime: apt.startTime,
        status: apt.status,
        service: apt.service,
        provider: apt.provider,
      })),
      packages: packages.map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        status: pkg.status,
        salePrice: pkg.salePrice,
        createdAt: pkg.createdAt,
      })),
      timeline: timeline.slice(0, 50),
    };
  }
}
