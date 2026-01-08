import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

// TTL em milissegundos
export const CACHE_TTL = {
  SHORT: 30 * 1000, // 30 segundos
  MEDIUM: 5 * 60 * 1000, // 5 minutos
  LONG: 30 * 60 * 1000, // 30 minutos
  HOUR: 60 * 60 * 1000, // 1 hora
  DAY: 24 * 60 * 60 * 1000, // 1 dia
};

// Prefixos de cache por entidade
export const CACHE_KEYS = {
  DASHBOARD: (tenantId: string) => `dashboard:${tenantId}`,
  SERVICES: (tenantId: string) => `services:${tenantId}`,
  SERVICES_ACTIVE: (tenantId: string) => `services:active:${tenantId}`,
  PROVIDERS: (tenantId: string) => `providers:${tenantId}`,
  PROVIDERS_ACTIVE: (tenantId: string) => `providers:active:${tenantId}`,
  CLIENTS: (tenantId: string) => `clients:${tenantId}`,
  APPOINTMENTS: (tenantId: string, date: string) => `appointments:${tenantId}:${date}`,
  MEDICAL_RECORD: (tenantId: string, clientId: string) => `medical-record:${tenantId}:${clientId}`,
  MEDICAL_ENTRIES: (medicalRecordId: string) => `medical-entries:${medicalRecordId}`,
  SESSION: (userId: string, tokenId: string) => `session:${userId}:${tokenId}`,
  USER_SESSIONS: (userId: string) => `sessions:${userId}`,
  RATE_LIMIT: (ip: string, endpoint: string) => `ratelimit:${ip}:${endpoint}`,
};

@Injectable()
export class RedisService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Busca um valor do cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  /**
   * Define um valor no cache
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  /**
   * Remove um valor do cache
   */
  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  /**
   * Remove múltiplas chaves por padrão (prefix*)
   * Nota: Funciona melhor com Redis real; em memória pode ser limitado
   */
  async delByPattern(pattern: string): Promise<void> {
    const stores = this.cacheManager.stores as any[];

    // Itera sobre os stores disponíveis
    for (const store of stores) {
      // Se o store tem método keys (Redis)
      if (store.opts?.store?.keys) {
        try {
          const keys = await store.opts.store.keys(pattern);
          if (keys && keys.length > 0) {
            await Promise.all(keys.map((key: string) => this.del(key)));
          }
        } catch (error) {
          console.warn(`Erro ao deletar chaves por padrão ${pattern}:`, error);
        }
      }
    }
  }

  /**
   * Limpa todo o cache
   */
  async reset(): Promise<void> {
    await this.cacheManager.clear();
  }

  /**
   * Busca do cache ou executa função e cacheia resultado
   */
  async getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }

  // ========== Métodos específicos para invalidação de cache ==========

  /**
   * Invalida cache do dashboard de um tenant
   */
  async invalidateDashboard(tenantId: string): Promise<void> {
    await this.del(CACHE_KEYS.DASHBOARD(tenantId));
  }

  /**
   * Invalida cache de serviços de um tenant
   */
  async invalidateServices(tenantId: string): Promise<void> {
    await this.del(CACHE_KEYS.SERVICES(tenantId));
    await this.del(CACHE_KEYS.SERVICES_ACTIVE(tenantId));
    await this.invalidateDashboard(tenantId);
  }

  /**
   * Invalida cache de profissionais de um tenant
   */
  async invalidateProviders(tenantId: string): Promise<void> {
    await this.del(CACHE_KEYS.PROVIDERS(tenantId));
    await this.del(CACHE_KEYS.PROVIDERS_ACTIVE(tenantId));
    await this.invalidateDashboard(tenantId);
  }

  /**
   * Invalida cache de clientes de um tenant
   */
  async invalidateClients(tenantId: string): Promise<void> {
    await this.del(CACHE_KEYS.CLIENTS(tenantId));
    await this.invalidateDashboard(tenantId);
  }

  /**
   * Invalida cache de agendamentos de um tenant (para uma data específica ou todas)
   */
  async invalidateAppointments(tenantId: string, date?: string): Promise<void> {
    if (date) {
      await this.del(CACHE_KEYS.APPOINTMENTS(tenantId, date));
    }
    await this.delByPattern(`appointments:${tenantId}:*`);
    await this.invalidateDashboard(tenantId);
  }

  /**
   * Invalida todas as sessões de um usuário
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    await this.delByPattern(`session:${userId}:*`);
    await this.del(CACHE_KEYS.USER_SESSIONS(userId));
  }

  /**
   * Invalida cache de prontuário de um cliente
   */
  async invalidateMedicalRecord(
    tenantId: string,
    clientId: string,
    medicalRecordId?: string,
  ): Promise<void> {
    await this.del(CACHE_KEYS.MEDICAL_RECORD(tenantId, clientId));
    if (medicalRecordId) {
      await this.del(CACHE_KEYS.MEDICAL_ENTRIES(medicalRecordId));
    }
  }
}
