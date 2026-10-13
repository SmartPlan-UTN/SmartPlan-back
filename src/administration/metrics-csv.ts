import { AdministrationMetricsDto } from './dto/administration-response.dto';
import { AuditAction } from './entities/audit-log.entity';

const RANGE_LABELS: Record<string, string> = {
  today: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  month: 'Este mes',
};
const GROUP_LABELS: Record<string, string> = {
  couple: 'En pareja',
  'small-group': 'Grupo chico',
  'large-group': 'Grupo grande',
};
const ENTITY_LABELS: Record<string, string> = {
  user: 'Usuario',
  activity: 'Actividad',
  plan: 'Plan',
  rating: 'Valoración',
  feedback: 'Sugerencia',
};
const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Creado',
  update: 'Actualizado',
  delete: 'Eliminado',
  start_session: 'Inicio de sesión',
  end_session: 'Cierre de sesión',
  export: 'Reporte de métricas descargado',
};

function cell(value: string | number): string {
  if (typeof value === 'number') return String(value).replace('.', ',');
  // Quoting alone does not prevent spreadsheet formula execution.
  let first = 0;
  while (
    first < value.length &&
    (value.charCodeAt(first) <= 32 || value[first].trim() === '')
  )
    first++;
  const formula = ['=', '+', '@', '-'].includes(value[first] ?? '');
  const leadingControl = ['\t', '\r', '\n'].some((prefix) =>
    value.startsWith(prefix),
  );
  const text = formula || leadingControl ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Serializes the same snapshot used by REP-01 without recalculating metrics. */
export function metricsCsv(metrics: AdministrationMetricsDto): Buffer {
  const rows: Array<Array<string | number>> = [
    ['Reporte de métricas'],
    ['Fecha de generación', metrics.range.to.toISOString()],
    ['Período', RANGE_LABELS[metrics.range.key] ?? metrics.range.key],
    ['Desde', metrics.range.from.toISOString()],
    ['Hasta', metrics.range.to.toISOString()],
    [],
    ['Estado general'],
    ['Métrica', 'Valor'],
    ['Total de Usuarios', metrics.kpis.totalUsers],
    ['Planes Activos', metrics.kpis.activePlans],
    ['Actividades en Catálogo', metrics.kpis.catalogActivities],
    ['Denuncias abiertas', metrics.kpis.openReports],
    [],
    ['Rendimiento del período'],
    ['Métrica', 'Valor'],
    ['Tasa de Aceptación (%)', metrics.acceptanceRate],
    ['Valoración Promedio (sobre 5)', metrics.averageRating],
    ['Retención (%)', metrics.retentionRate],
  ];
  for (const [title, entries, labels] of [
    ['Estados de ánimo', metrics.distributions.moods, {}],
    ['Tamaño de grupo', metrics.distributions.groupSizes, GROUP_LABELS],
  ] as const) {
    rows.push([], [title], ['Categoría', 'Cantidad', 'Porcentaje (%)']);
    for (const entry of entries) {
      rows.push([
        (labels as Record<string, string>)[entry.key] ?? entry.name,
        entry.count,
        entry.percentage,
      ]);
    }
  }
  rows.push(
    [],
    ['Actividades más populares'],
    ['Actividad', 'Cantidad de planes'],
  );
  for (const activity of metrics.popularActivities.slice(0, 3)) {
    rows.push([activity.name, activity.planCount]);
  }
  rows.push([], ['Actividad reciente'], ['Fecha', 'Descripción', 'Acción']);
  for (const entry of metrics.recentActivity) {
    const action = entry.action as AuditAction;
    const entity = ENTITY_LABELS[entry.affectedEntity] ?? 'Registro';
    const description = entry.label || `${entity} #${entry.affectedEntityId}`;
    rows.push([
      entry.createdAt.toISOString(),
      description,
      ACTION_LABELS[action] ?? 'Acción registrada',
    ]);
  }
  return Buffer.from(
    `\uFEFF${rows.map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`,
    'utf8',
  );
}
