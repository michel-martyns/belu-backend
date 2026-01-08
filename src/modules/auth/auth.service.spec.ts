import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { UserRole, PlanType } from '@prisma/client';

// Mock bcrypt
jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: jest.Mocked<PrismaService>;
  let usersService: jest.Mocked<UsersService>;
  let tenantService: jest.Mocked<TenantService>;
  let jwtService: jest.Mocked<JwtService>;
  let emailService: jest.Mocked<EmailService>;

  const mockUser = {
    id: 'user-123',
    tenantId: 'tenant-123',
    email: 'teste@clinica.com',
    password: 'hashed-password',
    name: 'Usuário Teste',
    role: UserRole.ADMIN,
    phone: '11999999999',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    businessName: null,
    slug: null,
    logo: null,
    description: null,
    address: null,
    whatsapp: null,
    instagram: null,
  };

  const mockTenant = {
    id: 'tenant-123',
    name: 'Clínica Teste',
    slug: 'clinica-teste',
    plan: PlanType.PROFESSIONAL,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUserWithTenant = {
    ...mockUser,
    tenant: mockTenant,
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      tenant: {
        create: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const mockUsersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };

    const mockTenantService = {
      isSlugAvailable: jest.fn(),
      generateUniqueSlug: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
      signAsync: jest.fn().mockResolvedValue('mock-access-token'),
      verify: jest.fn(),
      verifyAsync: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          JWT_SECRET: 'test-secret',
          JWT_EXPIRES_IN: '15m',
          FRONTEND_URL: 'http://localhost:3000',
        };
        return config[key];
      }),
    };

    const mockEmailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
      sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UsersService, useValue: mockUsersService },
        { provide: TenantService, useValue: mockTenantService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    usersService = module.get(UsersService);
    tenantService = module.get(TenantService);
    jwtService = module.get(JwtService);
    emailService = module.get(EmailService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    const loginDto = {
      email: 'teste@clinica.com',
      password: 'senha123',
    };

    it('should successfully login a user with valid credentials', async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUserWithTenant);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prismaService.refreshToken.create = jest.fn().mockResolvedValue({
        id: 'token-123',
        token: 'refresh-token',
      });

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(loginDto.email);
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email },
        include: { tenant: true },
      });
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Email ou senha inválidos');
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUserWithTenant);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Email ou senha inválidos');
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUserWithTenant, isActive: false };
      prismaService.user.findUnique = jest.fn().mockResolvedValue(inactiveUser);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Sua conta está desativada');
    });

    it('should throw UnauthorizedException for inactive tenant', async () => {
      const userWithInactiveTenant = {
        ...mockUserWithTenant,
        tenant: { ...mockTenant, isActive: false },
      };
      prismaService.user.findUnique = jest.fn().mockResolvedValue(userWithInactiveTenant);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('Sua clínica está desativada');
    });
  });

  describe('register', () => {
    const registerDto = {
      email: 'novo@clinica.com',
      password: 'senha123',
      name: 'Novo Usuário',
      businessName: 'Nova Clínica',
      phone: '11999999999',
    };

    it('should successfully register a new user and tenant', async () => {
      usersService.findByEmail = jest.fn().mockResolvedValue(null);
      tenantService.generateUniqueSlug = jest.fn().mockResolvedValue('nova-clinica');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');

      const transactionResult = {
        tenant: mockTenant,
        user: mockUser,
      };
      prismaService.$transaction = jest.fn().mockResolvedValue(transactionResult);
      prismaService.refreshToken.create = jest.fn().mockResolvedValue({
        id: 'token-123',
        token: 'refresh-token',
      });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toBeDefined();
      expect(result.tenant).toBeDefined();
      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
    });

    it('should throw ConflictException if email already exists', async () => {
      usersService.findByEmail = jest.fn().mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toThrow('Email já cadastrado');
    });

    it('should throw ConflictException if slug is already in use', async () => {
      usersService.findByEmail = jest.fn().mockResolvedValue(null);
      tenantService.isSlugAvailable = jest.fn().mockResolvedValue(false);

      const dtoWithSlug = { ...registerDto, slug: 'existing-slug' };

      await expect(service.register(dtoWithSlug)).rejects.toThrow(ConflictException);
      await expect(service.register(dtoWithSlug)).rejects.toThrow('Este slug já está em uso');
    });
  });

  describe('validateUser', () => {
    it('should return user data for valid active user', async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUserWithTenant);

      const result = await service.validateUser('user-123');

      expect(result).toHaveProperty('id', 'user-123');
      expect(result).toHaveProperty('email', mockUser.email);
      expect(result).toHaveProperty('tenantId', mockUser.tenantId);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.validateUser('invalid-id')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUserWithTenant, isActive: false };
      prismaService.user.findUnique = jest.fn().mockResolvedValue(inactiveUser);

      await expect(service.validateUser('user-123')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('checkSlug', () => {
    it('should return available: true for available slug', async () => {
      tenantService.isSlugAvailable = jest.fn().mockResolvedValue(true);

      const result = await service.checkSlug('new-slug');

      expect(result).toEqual({ available: true });
    });

    it('should return available: false for unavailable slug', async () => {
      tenantService.isSlugAvailable = jest.fn().mockResolvedValue(false);

      const result = await service.checkSlug('existing-slug');

      expect(result).toEqual({ available: false });
    });
  });

  describe('logout', () => {
    it('should revoke refresh token on logout', async () => {
      prismaService.refreshToken.updateMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.logout('refresh-token');

      expect(prismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: 'refresh-token' },
        data: { isRevoked: true },
      });
    });
  });

  describe('logoutAll', () => {
    it('should revoke all user refresh tokens', async () => {
      prismaService.refreshToken.updateMany = jest.fn().mockResolvedValue({ count: 3 });

      await service.logoutAll('user-123');

      expect(prismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: { isRevoked: true },
      });
    });
  });

  describe('me', () => {
    it('should return current user data', async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(mockUserWithTenant);

      const result = await service.me('user-123');

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tenant');
      expect(result.user).toHaveProperty('id', 'user-123');
      expect(result.user).toHaveProperty('email', mockUser.email);
      expect(result.tenant).toHaveProperty('id', mockTenant.id);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prismaService.user.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.me('invalid-id')).rejects.toThrow(UnauthorizedException);
    });
  });
});
