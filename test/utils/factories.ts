import { UserRole, PlanType, AppointmentStatus, Gender } from '@prisma/client';

// Factory para criar dados de teste

export const createTestTenant = (overrides = {}) => ({
  id: 'tenant-123',
  name: 'Clínica Teste',
  slug: 'clinica-teste',
  plan: PlanType.PROFESSIONAL,
  isActive: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

export const createTestUser = (overrides = {}) => ({
  id: 'user-123',
  tenantId: 'tenant-123',
  email: 'teste@clinica.com',
  password: '$2b$10$hashedpassword', // bcrypt hash
  name: 'Usuário Teste',
  role: UserRole.ADMIN,
  phone: '11999999999',
  isActive: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  businessName: null,
  slug: null,
  logo: null,
  description: null,
  address: null,
  whatsapp: null,
  instagram: null,
  ...overrides,
});

export const createTestClient = (overrides = {}) => ({
  id: 'client-123',
  tenantId: 'tenant-123',
  name: 'Cliente Teste',
  email: 'cliente@email.com',
  phone: '11888888888',
  cpf: '12345678900',
  birthDate: new Date('1990-01-01'),
  gender: Gender.FEMALE,
  address: 'Rua Teste, 123',
  notes: null,
  source: 'WEBSITE',
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

export const createTestService = (overrides = {}) => ({
  id: 'service-123',
  tenantId: 'tenant-123',
  name: 'Limpeza de Pele',
  description: 'Procedimento de limpeza facial',
  duration: 60,
  price: 150.0,
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

export const createTestProvider = (overrides = {}) => ({
  id: 'provider-123',
  tenantId: 'tenant-123',
  name: 'Dr. Teste',
  email: 'dr.teste@clinica.com',
  phone: '11777777777',
  specialty: 'Dermatologia',
  bio: 'Especialista em tratamentos estéticos',
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

export const createTestAppointment = (overrides = {}) => ({
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
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

export const createTestRefreshToken = (overrides = {}) => ({
  id: 'token-123',
  userId: 'user-123',
  token: 'refresh-token-abc123',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  userAgent: 'Mozilla/5.0',
  ipAddress: '127.0.0.1',
  isRevoked: false,
  createdAt: new Date('2025-01-01'),
  ...overrides,
});

export const createTestPasswordResetToken = (overrides = {}) => ({
  id: 'reset-123',
  userId: 'user-123',
  token: 'reset-token-abc123',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
  usedAt: null,
  createdAt: new Date('2025-01-01'),
  ...overrides,
});

// JWT Payload mock
export const createTestJwtPayload = (overrides = {}) => ({
  sub: 'user-123',
  email: 'teste@clinica.com',
  tenantId: 'tenant-123',
  role: UserRole.ADMIN,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
  ...overrides,
});

// CurrentUser mock
export const createTestCurrentUser = (overrides = {}) => ({
  id: 'user-123',
  sub: 'user-123',
  email: 'teste@clinica.com',
  tenantId: 'tenant-123',
  role: UserRole.ADMIN,
  ...overrides,
});
