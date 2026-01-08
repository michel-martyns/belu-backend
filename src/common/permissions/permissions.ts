import { UserRole, PlanType } from '@prisma/client';

/**
 * Define todas as permissões do sistema
 */
export enum Permission {
  // Clientes
  CLIENTS_VIEW = 'clients:view',
  CLIENTS_CREATE = 'clients:create',
  CLIENTS_EDIT = 'clients:edit',
  CLIENTS_DELETE = 'clients:delete',

  // Serviços
  SERVICES_VIEW = 'services:view',
  SERVICES_CREATE = 'services:create',
  SERVICES_EDIT = 'services:edit',
  SERVICES_DELETE = 'services:delete',

  // Profissionais
  PROVIDERS_VIEW = 'providers:view',
  PROVIDERS_CREATE = 'providers:create',
  PROVIDERS_EDIT = 'providers:edit',
  PROVIDERS_DELETE = 'providers:delete',

  // Agendamentos
  APPOINTMENTS_VIEW = 'appointments:view',
  APPOINTMENTS_CREATE = 'appointments:create',
  APPOINTMENTS_EDIT = 'appointments:edit',
  APPOINTMENTS_CANCEL = 'appointments:cancel',

  // Dashboard
  DASHBOARD_VIEW = 'dashboard:view',
  DASHBOARD_FINANCIAL = 'dashboard:financial',

  // Configurações
  SETTINGS_VIEW = 'settings:view',
  SETTINGS_EDIT = 'settings:edit',

  // Usuários do Tenant
  USERS_VIEW = 'users:view',
  USERS_CREATE = 'users:create',
  USERS_EDIT = 'users:edit',
  USERS_DELETE = 'users:delete',

  // Financeiro (futuro)
  FINANCIAL_VIEW = 'financial:view',
  FINANCIAL_CREATE = 'financial:create',
  FINANCIAL_EDIT = 'financial:edit',

  // Relatórios
  REPORTS_VIEW = 'reports:view',
  REPORTS_EXPORT = 'reports:export',

  // Marketing (futuro)
  MARKETING_VIEW = 'marketing:view',
  MARKETING_MANAGE = 'marketing:manage',

  // Prontuário
  MEDICAL_RECORDS_VIEW = 'medical_records:view',
  MEDICAL_RECORDS_CREATE = 'medical_records:create',
  MEDICAL_RECORDS_EDIT = 'medical_records:edit',

  // Estoque
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_CREATE = 'inventory:create',
  INVENTORY_EDIT = 'inventory:edit',

  // Leads
  LEADS_VIEW = 'leads:view',
  LEADS_CREATE = 'leads:create',
  LEADS_EDIT = 'leads:edit',
  LEADS_CONVERT = 'leads:convert',

  // Notificações
  NOTIFICATIONS_VIEW = 'notifications:view',
  NOTIFICATIONS_SEND = 'notifications:send',
  NOTIFICATIONS_MANAGE = 'notifications:manage',

  // Sistema (Super Admin)
  SYSTEM_ADMIN = 'system:admin',
  SYSTEM_BILLING = 'system:billing',
  SYSTEM_PLANS = 'system:plans',
  SYSTEM_TENANTS = 'system:tenants',

  // Pagamentos
  PAYMENTS_VIEW = 'payments:view',
  PAYMENTS_MANAGE = 'payments:manage',

  // Webhooks
  WEBHOOKS_VIEW = 'webhooks:view',
  WEBHOOKS_MANAGE = 'webhooks:manage',

  // Google Calendar
  CALENDAR_VIEW = 'calendar:view',
  CALENDAR_MANAGE = 'calendar:manage',

  // Pacotes de Clientes
  PACKAGES_VIEW = 'packages:view',
  PACKAGES_CREATE = 'packages:create',
  PACKAGES_EDIT = 'packages:edit',

  // Assinatura Digital
  SIGNATURES_VIEW = 'signatures:view',
  SIGNATURES_CREATE = 'signatures:create',
  SIGNATURES_MANAGE = 'signatures:manage',

  // Localizações/Unidades
  LOCATIONS_VIEW = 'locations:view',
  LOCATIONS_CREATE = 'locations:create',
  LOCATIONS_EDIT = 'locations:edit',
}

/**
 * Mapa de permissões por role
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // Super Admin - acesso total ao sistema (nível plataforma)
  [UserRole.SUPER_ADMIN]: Object.values(Permission),

  // Admin - dono da clínica, acesso total ao tenant
  [UserRole.ADMIN]: [
    // Clientes
    Permission.CLIENTS_VIEW,
    Permission.CLIENTS_CREATE,
    Permission.CLIENTS_EDIT,
    Permission.CLIENTS_DELETE,
    // Serviços
    Permission.SERVICES_VIEW,
    Permission.SERVICES_CREATE,
    Permission.SERVICES_EDIT,
    Permission.SERVICES_DELETE,
    // Profissionais
    Permission.PROVIDERS_VIEW,
    Permission.PROVIDERS_CREATE,
    Permission.PROVIDERS_EDIT,
    Permission.PROVIDERS_DELETE,
    // Agendamentos
    Permission.APPOINTMENTS_VIEW,
    Permission.APPOINTMENTS_CREATE,
    Permission.APPOINTMENTS_EDIT,
    Permission.APPOINTMENTS_CANCEL,
    // Dashboard
    Permission.DASHBOARD_VIEW,
    Permission.DASHBOARD_FINANCIAL,
    // Configurações
    Permission.SETTINGS_VIEW,
    Permission.SETTINGS_EDIT,
    // Usuários
    Permission.USERS_VIEW,
    Permission.USERS_CREATE,
    Permission.USERS_EDIT,
    Permission.USERS_DELETE,
    // Financeiro
    Permission.FINANCIAL_VIEW,
    Permission.FINANCIAL_CREATE,
    Permission.FINANCIAL_EDIT,
    // Relatórios
    Permission.REPORTS_VIEW,
    Permission.REPORTS_EXPORT,
    // Marketing
    Permission.MARKETING_VIEW,
    Permission.MARKETING_MANAGE,
    // Prontuário
    Permission.MEDICAL_RECORDS_VIEW,
    Permission.MEDICAL_RECORDS_CREATE,
    Permission.MEDICAL_RECORDS_EDIT,
    // Estoque
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_CREATE,
    Permission.INVENTORY_EDIT,
    // Leads
    Permission.LEADS_VIEW,
    Permission.LEADS_CREATE,
    Permission.LEADS_EDIT,
    Permission.LEADS_CONVERT,
    // Notificações
    Permission.NOTIFICATIONS_VIEW,
    Permission.NOTIFICATIONS_SEND,
    Permission.NOTIFICATIONS_MANAGE,
  ],

  // Manager - gerente, quase tudo exceto configurações críticas
  [UserRole.MANAGER]: [
    // Clientes
    Permission.CLIENTS_VIEW,
    Permission.CLIENTS_CREATE,
    Permission.CLIENTS_EDIT,
    // Serviços
    Permission.SERVICES_VIEW,
    Permission.SERVICES_CREATE,
    Permission.SERVICES_EDIT,
    // Profissionais
    Permission.PROVIDERS_VIEW,
    Permission.PROVIDERS_CREATE,
    Permission.PROVIDERS_EDIT,
    // Agendamentos
    Permission.APPOINTMENTS_VIEW,
    Permission.APPOINTMENTS_CREATE,
    Permission.APPOINTMENTS_EDIT,
    Permission.APPOINTMENTS_CANCEL,
    // Dashboard
    Permission.DASHBOARD_VIEW,
    Permission.DASHBOARD_FINANCIAL,
    // Configurações (apenas visualizar)
    Permission.SETTINGS_VIEW,
    // Usuários (apenas visualizar)
    Permission.USERS_VIEW,
    // Financeiro
    Permission.FINANCIAL_VIEW,
    Permission.FINANCIAL_CREATE,
    // Relatórios
    Permission.REPORTS_VIEW,
    Permission.REPORTS_EXPORT,
    // Marketing
    Permission.MARKETING_VIEW,
    Permission.MARKETING_MANAGE,
    // Prontuário
    Permission.MEDICAL_RECORDS_VIEW,
    Permission.MEDICAL_RECORDS_CREATE,
    Permission.MEDICAL_RECORDS_EDIT,
    // Estoque
    Permission.INVENTORY_VIEW,
    Permission.INVENTORY_CREATE,
    Permission.INVENTORY_EDIT,
    // Leads
    Permission.LEADS_VIEW,
    Permission.LEADS_CREATE,
    Permission.LEADS_EDIT,
    Permission.LEADS_CONVERT,
    // Notificações
    Permission.NOTIFICATIONS_VIEW,
    Permission.NOTIFICATIONS_SEND,
    Permission.NOTIFICATIONS_MANAGE,
  ],

  // Operator - recepcionista, operações do dia a dia
  [UserRole.OPERATOR]: [
    // Clientes
    Permission.CLIENTS_VIEW,
    Permission.CLIENTS_CREATE,
    Permission.CLIENTS_EDIT,
    // Serviços (apenas visualizar)
    Permission.SERVICES_VIEW,
    // Profissionais (apenas visualizar)
    Permission.PROVIDERS_VIEW,
    // Agendamentos
    Permission.APPOINTMENTS_VIEW,
    Permission.APPOINTMENTS_CREATE,
    Permission.APPOINTMENTS_EDIT,
    Permission.APPOINTMENTS_CANCEL,
    // Dashboard (básico)
    Permission.DASHBOARD_VIEW,
    // Prontuário (apenas visualizar)
    Permission.MEDICAL_RECORDS_VIEW,
    // Leads (cadastro e visualização)
    Permission.LEADS_VIEW,
    Permission.LEADS_CREATE,
    Permission.LEADS_EDIT,
    // Notificações (visualização e envio apenas)
    Permission.NOTIFICATIONS_VIEW,
    Permission.NOTIFICATIONS_SEND,
  ],

  // Provider - profissional, acesso limitado
  [UserRole.PROVIDER]: [
    // Clientes (apenas visualizar seus atendimentos)
    Permission.CLIENTS_VIEW,
    // Serviços (apenas visualizar)
    Permission.SERVICES_VIEW,
    // Profissionais (apenas visualizar)
    Permission.PROVIDERS_VIEW,
    // Agendamentos (apenas seus)
    Permission.APPOINTMENTS_VIEW,
    // Dashboard (apenas seu)
    Permission.DASHBOARD_VIEW,
    // Prontuário
    Permission.MEDICAL_RECORDS_VIEW,
    Permission.MEDICAL_RECORDS_CREATE,
    Permission.MEDICAL_RECORDS_EDIT,
  ],
};

/**
 * Limites por plano
 */
export const PLAN_LIMITS: Record<
  PlanType,
  {
    maxUsers: number;
    maxClients: number;
    maxProviders: number;
    maxAppointmentsPerMonth: number;
    maxStorageMB: number;
    features: string[];
  }
> = {
  [PlanType.FREE]: {
    maxUsers: 1,
    maxClients: 50,
    maxProviders: 1,
    maxAppointmentsPerMonth: 30,
    maxStorageMB: 10,
    features: ['basic_scheduling', 'basic_dashboard'],
  },
  [PlanType.STARTER]: {
    maxUsers: 2,
    maxClients: 200,
    maxProviders: 2,
    maxAppointmentsPerMonth: 100,
    maxStorageMB: 50,
    features: ['basic_scheduling', 'basic_dashboard', 'client_history'],
  },
  [PlanType.PROFESSIONAL]: {
    maxUsers: 5,
    maxClients: -1, // ilimitado
    maxProviders: 5,
    maxAppointmentsPerMonth: -1,
    maxStorageMB: 500,
    features: [
      'basic_scheduling',
      'basic_dashboard',
      'client_history',
      'public_page',
      'medical_records',
      'inventory',
      'leads_basic',
      'financial',
      'whatsapp_notifications',
    ],
  },
  [PlanType.ENTERPRISE]: {
    maxUsers: -1,
    maxClients: -1,
    maxProviders: -1,
    maxAppointmentsPerMonth: -1,
    maxStorageMB: 5000,
    features: [
      'basic_scheduling',
      'basic_dashboard',
      'client_history',
      'public_page',
      'page_builder',
      'medical_records',
      'inventory',
      'leads_full',
      'financial',
      'marketing',
      'whatsapp_notifications',
      'api_access',
      'multi_clinic',
      'custom_reports',
    ],
  },
};

/**
 * Verifica se um role tem uma permissão específica
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Verifica se um role tem todas as permissões especificadas
 */
export function hasAllPermissions(
  role: UserRole,
  permissions: Permission[],
): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Verifica se um role tem pelo menos uma das permissões especificadas
 */
export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Retorna todas as permissões de um role
 */
export function getPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Verifica se um plano tem uma feature específica
 */
export function hasFeature(plan: PlanType, feature: string): boolean {
  return PLAN_LIMITS[plan]?.features.includes(feature) ?? false;
}

/**
 * Retorna os limites de um plano
 */
export function getPlanLimits(plan: PlanType) {
  return PLAN_LIMITS[plan];
}
