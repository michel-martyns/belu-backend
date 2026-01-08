import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentStatus } from '@prisma/client';

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let prismaService: jest.Mocked<PrismaService>;

  const tenantId = 'tenant-123';

  const mockService = {
    id: 'service-123',
    tenantId: 'tenant-123',
    name: 'Limpeza de Pele',
    duration: 60,
    price: 150.0,
  };

  const mockProvider = {
    id: 'provider-123',
    tenantId: 'tenant-123',
    name: 'Dr. Teste',
  };

  const mockClient = {
    id: 'client-123',
    tenantId: 'tenant-123',
    name: 'Cliente Teste',
  };

  const mockAppointment = {
    id: 'appointment-123',
    tenantId: 'tenant-123',
    clientId: 'client-123',
    serviceId: 'service-123',
    providerId: 'provider-123',
    date: new Date('2025-02-01'),
    startTime: '10:00',
    endTime: '11:00',
    status: AppointmentStatus.SCHEDULED,
    price: 150.0,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    client: mockClient,
    provider: mockProvider,
    service: mockService,
  };

  const mockAppointments = [
    mockAppointment,
    { ...mockAppointment, id: 'appointment-456', startTime: '14:00', endTime: '15:00' },
  ];

  beforeEach(async () => {
    const mockPrismaService = {
      appointment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      service: {
        findFirst: jest.fn(),
      },
      provider: {
        findFirst: jest.fn(),
      },
      client: {
        findFirst: jest.fn(),
      },
      providerService: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      providerSchedule: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    prismaService = module.get(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all appointments for a tenant', async () => {
      prismaService.appointment.findMany = jest.fn().mockResolvedValue(mockAppointments);

      const result = await service.findAll(tenantId);

      expect(result).toEqual(mockAppointments);
      expect(prismaService.appointment.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        include: {
          client: true,
          provider: true,
          service: true,
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    });

    it('should filter appointments by date', async () => {
      prismaService.appointment.findMany = jest.fn().mockResolvedValue([mockAppointment]);

      const result = await service.findAll(tenantId, { date: '2025-02-01' });

      expect(result).toHaveLength(1);
      expect(prismaService.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            date: new Date('2025-02-01'),
          }),
        }),
      );
    });

    it('should filter appointments by status', async () => {
      prismaService.appointment.findMany = jest.fn().mockResolvedValue([mockAppointment]);

      const result = await service.findAll(tenantId, { status: AppointmentStatus.SCHEDULED });

      expect(prismaService.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            status: AppointmentStatus.SCHEDULED,
          }),
        }),
      );
    });

    it('should filter appointments by provider', async () => {
      prismaService.appointment.findMany = jest.fn().mockResolvedValue([mockAppointment]);

      const result = await service.findAll(tenantId, { providerId: 'provider-123' });

      expect(prismaService.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            providerId: 'provider-123',
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return an appointment when found', async () => {
      prismaService.appointment.findFirst = jest.fn().mockResolvedValue(mockAppointment);

      const result = await service.findById('appointment-123', tenantId);

      expect(result).toEqual(mockAppointment);
      expect(prismaService.appointment.findFirst).toHaveBeenCalledWith({
        where: { id: 'appointment-123', tenantId },
        include: {
          client: true,
          provider: true,
          service: true,
        },
      });
    });

    it('should throw NotFoundException when appointment not found', async () => {
      prismaService.appointment.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.findById('invalid-id', tenantId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('invalid-id', tenantId)).rejects.toThrow(
        'Agendamento não encontrado',
      );
    });
  });

  describe('create', () => {
    const createDto = {
      clientId: 'client-123',
      serviceId: 'service-123',
      providerId: 'provider-123',
      date: '2025-02-01',
      startTime: '10:00',
      notes: 'Observações',
    };

    it('should create a new appointment', async () => {
      prismaService.service.findFirst = jest.fn().mockResolvedValue(mockService);
      // Mock findMany for conflict check - return empty array (no conflicts)
      prismaService.appointment.findMany = jest.fn().mockResolvedValue([]);
      prismaService.appointment.create = jest.fn().mockResolvedValue(mockAppointment);

      const result = await service.create(tenantId, createDto);

      expect(result).toEqual(mockAppointment);
      expect(prismaService.service.findFirst).toHaveBeenCalled();
      expect(prismaService.appointment.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if service not found', async () => {
      prismaService.service.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Serviço não encontrado',
      );
    });

    it('should throw BadRequestException for conflicting appointments', async () => {
      prismaService.service.findFirst = jest.fn().mockResolvedValue(mockService);
      // Mock findMany for conflict check - return existing appointment (conflict)
      prismaService.appointment.findMany = jest.fn().mockResolvedValue([mockAppointment]);

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update appointment status', async () => {
      const updatedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CONFIRMED,
      };
      prismaService.appointment.findFirst = jest.fn().mockResolvedValue(mockAppointment);
      prismaService.appointment.update = jest.fn().mockResolvedValue(updatedAppointment);

      const result = await service.updateStatus('appointment-123', tenantId, {
        status: AppointmentStatus.CONFIRMED,
      });

      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
      expect(prismaService.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appointment-123' },
        data: { status: AppointmentStatus.CONFIRMED },
        include: {
          client: true,
          provider: true,
          service: true,
        },
      });
    });

    it('should throw NotFoundException if appointment not found', async () => {
      prismaService.appointment.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.updateStatus('invalid-id', tenantId, {
          status: AppointmentStatus.CONFIRMED,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAvailableSlots', () => {
    it('should return available time slots for a provider on a date', async () => {
      // Mock provider schedule
      (prismaService.providerSchedule as any).findUnique = jest.fn().mockResolvedValue({
        dayOfWeek: 1,
        startTime: '09:00',
        endTime: '18:00',
        isActive: true,
      });
      prismaService.appointment.findMany = jest.fn().mockResolvedValue([
        { startTime: '10:00', endTime: '11:00' },
        { startTime: '14:00', endTime: '15:00' },
      ]);

      const result = await service.getAvailableSlots(
        tenantId,
        'provider-123',
        '2025-02-03', // Monday
        60, // duration in minutes
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });
});
