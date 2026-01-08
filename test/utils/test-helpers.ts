import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createTestJwtPayload } from './factories';

/**
 * Cria um token JWT válido para testes
 */
export const createTestToken = (jwtService: JwtService, payload = {}) => {
  return jwtService.sign({
    ...createTestJwtPayload(),
    ...payload,
  });
};

/**
 * Configura uma aplicação NestJS para testes e2e
 */
export const setupTestApp = async (module: TestingModule): Promise<INestApplication> => {
  const app = module.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  await app.init();
  return app;
};

/**
 * Mock do ConfigService
 */
export const createMockConfigService = (config: Record<string, any> = {}) => ({
  get: jest.fn((key: string) => {
    const defaultConfig: Record<string, any> = {
      JWT_SECRET: 'test-jwt-secret-key-for-testing',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
      BCRYPT_SALT_ROUNDS: '10',
      FRONTEND_URL: 'http://localhost:3000',
      REDIS_URL: 'redis://localhost:6379',
      ...config,
    };
    return defaultConfig[key];
  }),
});

/**
 * Mock do JwtService
 */
export const createMockJwtService = () => ({
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
  verify: jest.fn().mockReturnValue(createTestJwtPayload()),
  verifyAsync: jest.fn().mockResolvedValue(createTestJwtPayload()),
  decode: jest.fn().mockReturnValue(createTestJwtPayload()),
});

/**
 * Mock do EmailService
 */
export const createMockEmailService = () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
  sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
});

/**
 * Mock do RedisService/CacheManager
 */
export const createMockCacheManager = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  reset: jest.fn().mockResolvedValue(undefined),
});

/**
 * Mock do AuditService
 */
export const createMockAuditService = () => ({
  create: jest.fn().mockResolvedValue({ id: 'audit-123' }),
  logAsync: jest.fn().mockResolvedValue(undefined),
  logCreate: jest.fn().mockResolvedValue(undefined),
  logUpdate: jest.fn().mockResolvedValue(undefined),
  logDelete: jest.fn().mockResolvedValue(undefined),
  logLogin: jest.fn().mockResolvedValue(undefined),
  logLogout: jest.fn().mockResolvedValue(undefined),
  logCustom: jest.fn().mockResolvedValue(undefined),
});

/**
 * Mock do QueuesService
 */
export const createMockQueuesService = () => ({
  addEmailJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
  sendEmail: jest.fn().mockResolvedValue({ id: 'job-123' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ id: 'job-123' }),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ id: 'job-123' }),
  addNotificationJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
  sendNotification: jest.fn().mockResolvedValue({ id: 'job-123' }),
});

/**
 * Espera assíncrona para testes
 */
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Limpa todos os mocks de um objeto
 */
export const clearAllMocks = (mockObject: Record<string, any>) => {
  Object.values(mockObject).forEach(value => {
    if (typeof value === 'function' && 'mockClear' in value) {
      (value as jest.Mock).mockClear();
    } else if (typeof value === 'object' && value !== null) {
      clearAllMocks(value);
    }
  });
};
