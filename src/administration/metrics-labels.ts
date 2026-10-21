import { AuditAction } from './entities/audit-log.entity';

/** Spanish labels shared by every REP-01 export format (CU58). */
export const RANGE_LABELS: Record<string, string> = {
  today: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  month: 'Este mes',
};

export const GROUP_LABELS: Record<string, string> = {
  couple: 'En pareja',
  'small-group': 'Grupo chico',
  'large-group': 'Grupo grande',
};

export const ENTITY_LABELS: Record<string, string> = {
  user: 'Usuario',
  activity: 'Actividad',
  plan: 'Plan',
  rating: 'Valoración',
  feedback: 'Sugerencia',
};

export const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Creado',
  update: 'Actualizado',
  delete: 'Eliminado',
  start_session: 'Inicio de sesión',
  end_session: 'Cierre de sesión',
  export: 'Reporte de métricas descargado',
};
