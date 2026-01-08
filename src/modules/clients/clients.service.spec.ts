import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis';

describe('ClientsService', () => {
  let service: ClientsService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;

  const tenantId = 'tenant-123';

  const mockClient = {
    id: 'client-123',
    tenantId: 'tenant-123',
    name: 'Cliente Teste',
    email: 'cliente@email.com',
    phone: '11888888888',
    cpf: '12345678900',
    birthDate: new Date('1990-01-01'),
    gender: 'FEMALE' as const,
    address: 'Rua Teste, 123',
    notes: null,
    source: 'WEBSITE',
    isActive: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockClients = [
    mockClient,
    { ...mockClient, id: 'client-456', name: 'Cliente 2' },
  ];

  beforeEach(async () => {
    const mockPrismaService = {
      client: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      appointment: {
        findMany: jest.fn(),
      },
    };

    const mockRedisService = {
      getOrSet: jest.fn(),
      invalidateClients: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all clients for a tenant (from cache or db)', async () => {
      redisService.getOrSet = jest.fn().mockResolvedValue(mockClients);

      const result = await service.findAll(tenantId);

      expect(result).toEqual(mockClients);
      expect(redisService.getOrSet).toHaveBeenCalled();
    });

    it('should fetch from database when cache miss', async () => {
      // Simula o comportamento do getOrSet executando o callback
      redisService.getOrSet = jest.fn().mockImplementation(async (key, callback) => {
        return callback();
      });
      prismaService.client.findMany = jest.fn().mockResolvedValue(mockClients);

      const result = await service.findAll(tenantId);

      expect(result).toEqual(mockClients);
      expect(prismaService.client.findMany).toHaveBeenCalledWith({
        where: { tenantId },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('should return a client when found', async () => {
      prismaService.client.findFirst = jest.fn().mockResolvedValue(mockClient);

      const result = await service.findById('client-123', tenantId);

      expect(result).toEqual(mockClient);
      expect(prismaService.client.findFirst).toHaveBeenCalledWith({
        where: { id: 'client-123', tenantId },
      });
    });

    it('should throw NotFoundException when client not found', async () => {
      prismaService.client.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.findById('invalid-id', tenantId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('invalid-id', tenantId)).rejects.toThrow(
        'Cliente não encontrado',
      );
    });
  });

  describe('create', () => {
    const createDto = {
      name: 'Novo Cliente',
      phone: '11999999999',
      email: 'novo@email.com',
      notes: 'Observações',
    };

    it('should create a new client', async () => {
      const newClient = { ...mockClient, ...createDto, id: 'new-client-123' };
      prismaService.client.create = jest.fn().mockResolvedValue(newClient);
      redisService.invalidateClients = jest.fn().mockResolvedValue(undefined);

      const result = await service.create(tenantId, createDto);

      expect(result).toEqual(newClient);
      expect(prismaService.client.create).toHaveBeenCalledWith({
        data: {
          tenantId,
          name: createDto.name,
          phone: createDto.phone,
          email: createDto.email,
          notes: createDto.notes,
        },
      });
      expect(redisService.invalidateClients).toHaveBeenCalledWith(tenantId);
    });
  });

  describe('update', () => {
    const updateDto = {
      name: 'Cliente Atualizado',
      phone: '11888888888',
    };

    it('should update an existing client', async () => {
      const updatedClient = { ...mockClient, ...updateDto };
      prismaService.client.findFirst = jest.fn().mockResolvedValue(mockClient);
      prismaService.client.update = jest.fn().mockResolvedValue(updatedClient);
      redisService.invalidateClients = jest.fn().mockResolvedValue(undefined);

      const result = await service.update('client-123', tenantId, updateDto);

      expect(result).toEqual(updatedClient);
      expect(prismaService.client.update).toHaveBeenCalledWith({
        where: { id: 'client-123' },
        data: updateDto,
      });
      expect(redisService.invalidateClients).toHaveBeenCalledWith(tenantId);
    });

    it('should throw NotFoundException if client does not exist', async () => {
      prismaService.client.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.update('invalid-id', tenantId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete a client', async () => {
      prismaService.client.findFirst = jest.fn().mockResolvedValue(mockClient);
      prismaService.client.delete = jest.fn().mockResolvedValue(mockClient);
      redisService.invalidateClients = jest.fn().mockResolvedValue(undefined);

      const result = await service.delete('client-123', tenantId);

      expect(result).toEqual(mockClient);
      expect(prismaService.client.delete).toHaveBeenCalledWith({
        where: { id: 'client-123' },
      });
      expect(redisService.invalidateClients).toHaveBeenCalledWith(tenantId);
    });

    it('should throw NotFoundException if client does not exist', async () => {
      prismaService.client.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.delete('invalid-id', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('search', () => {
    it('should search clients by name, email or phone', async () => {
      prismaService.client.findMany = jest.fn().mockResolvedValue(mockClients);

      const result = await service.search(tenantId, 'teste');

      expect(result).toEqual(mockClients);
      expect(prismaService.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            OR: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe('findHistory', () => {
    const mockAppointments = [
      {
        id: 'appointment-1',
        clientId: 'client-123',
        service: { name: 'Limpeza de Pele' },
        provider: { name: 'Dr. Teste' },
      },
    ];

    it('should return client appointment history', async () => {
      prismaService.client.findFirst = jest.fn().mockResolvedValue(mockClient);
      prismaService.appointment.findMany = jest.fn().mockResolvedValue(mockAppointments);

      const result = await service.findHistory('client-123', tenantId);

      expect(result).toEqual(mockAppointments);
      expect(prismaService.appointment.findMany).toHaveBeenCalledWith({
        where: { clientId: 'client-123', tenantId },
        include: {
          service: true,
          provider: true,
        },
        orderBy: { date: 'desc' },
      });
    });

    it('should throw NotFoundException if client does not exist', async () => {
      prismaService.client.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.findHistory('invalid-id', tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
