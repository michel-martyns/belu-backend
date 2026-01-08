/**
 * Constantes para o sistema de filas BullMQ
 */

// Nomes das filas
export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATION: 'notification',
  WHATSAPP: 'whatsapp',
  BILLING: 'billing',
  REPORTS: 'reports',
} as const;

// Tipos de jobs por fila
export const EMAIL_JOBS = {
  SEND_EMAIL: 'send-email',
  SEND_PASSWORD_RESET: 'send-password-reset',
  SEND_WELCOME: 'send-welcome',
  SEND_PASSWORD_CHANGED: 'send-password-changed',
  SEND_APPOINTMENT_CONFIRMATION: 'send-appointment-confirmation',
  SEND_APPOINTMENT_REMINDER: 'send-appointment-reminder',
} as const;

export const NOTIFICATION_JOBS = {
  SEND_NOTIFICATION: 'send-notification',
  SEND_BULK: 'send-bulk-notification',
  PROCESS_SCHEDULED: 'process-scheduled',
} as const;

export const WHATSAPP_JOBS = {
  SEND_MESSAGE: 'send-message',
  SEND_TEMPLATE: 'send-template',
  SEND_MEDIA: 'send-media',
} as const;

export const BILLING_JOBS = {
  GENERATE_INVOICE: 'generate-invoice',
  PROCESS_PAYMENT: 'process-payment',
  RETRY_PAYMENT: 'retry-payment',
  SEND_REMINDER: 'send-reminder',
  EXPIRE_TRIAL: 'expire-trial',
  RENEW_SUBSCRIPTION: 'renew-subscription',
  CANCEL_SUBSCRIPTION: 'cancel-subscription',
} as const;

export const REPORTS_JOBS = {
  GENERATE_FINANCIAL: 'generate-financial',
  GENERATE_APPOINTMENTS: 'generate-appointments',
  EXPORT_DATA: 'export-data',
} as const;

// Configurações padrão de jobs
export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000, // 1 segundo inicial
  },
  removeOnComplete: {
    age: 24 * 3600, // Manter por 24 horas
    count: 1000, // Manter últimos 1000
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // Manter falhas por 7 dias
  },
};

// Configurações específicas por tipo de job
export const JOB_OPTIONS = {
  EMAIL: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 5,
    backoff: {
      type: 'exponential' as const,
      delay: 2000,
    },
  },
  WHATSAPP: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 5000, // WhatsApp tem rate limits
    },
  },
  BILLING: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 5,
    backoff: {
      type: 'exponential' as const,
      delay: 60000, // 1 minuto para billing
    },
  },
  REPORTS: {
    ...DEFAULT_JOB_OPTIONS,
    attempts: 2,
    timeout: 300000, // 5 minutos para relatórios
  },
};

// Prioridades de jobs (menor = maior prioridade)
export const JOB_PRIORITY = {
  CRITICAL: 1,
  HIGH: 2,
  NORMAL: 5,
  LOW: 10,
};

// Interface para dados de jobs
export interface EmailJobData {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  template?: string;
  context?: Record<string, any>;
  tenantId?: string;
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
}

export interface NotificationJobData {
  tenantId: string;
  notificationId?: string;
  recipientType: string;
  recipientId: string;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  channel: 'WHATSAPP' | 'EMAIL' | 'SMS' | 'PUSH';
  templateId?: string;
  subject?: string;
  content: string;
  variables?: Record<string, string>;
  scheduledAt?: Date;
  metadata?: Record<string, any>;
}

export interface WhatsAppJobData {
  tenantId: string;
  to: string;
  message?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
  mediaUrl?: string;
  mediaType?: 'image' | 'document' | 'audio' | 'video';
  notificationId?: string;
}

export interface BillingJobData {
  tenantId?: string;
  subscriptionId?: string;
  invoiceId?: string;
  paymentId?: string;
  jobType: string;
  metadata?: Record<string, any>;
}

export interface ReportJobData {
  tenantId: string;
  reportType: string;
  startDate?: Date;
  endDate?: Date;
  filters?: Record<string, any>;
  format?: 'pdf' | 'xlsx' | 'csv';
  recipientEmail?: string;
}
