import { SetMetadata } from '@nestjs/common';

export const PLAN_FEATURE_KEY = 'plan_feature';

/**
 * Decorator para definir qual feature é necessária para acessar um endpoint
 *
 * @example
 * // Requer feature de prontuário
 * @RequirePlanFeature('medical_records')
 * @Get('records')
 * getRecords() { ... }
 */
export const RequirePlanFeature = (feature: string) =>
  SetMetadata(PLAN_FEATURE_KEY, feature);

export const PLAN_LIMIT_KEY = 'plan_limit';

export type PlanLimitType =
  | 'maxUsers'
  | 'maxClients'
  | 'maxProviders'
  | 'maxAppointmentsPerMonth';

/**
 * Decorator para verificar limites do plano antes de criar recursos
 *
 * @example
 * // Verifica limite de clientes antes de criar
 * @CheckPlanLimit('maxClients')
 * @Post()
 * create() { ... }
 */
export const CheckPlanLimit = (limitType: PlanLimitType) =>
  SetMetadata(PLAN_LIMIT_KEY, limitType);
