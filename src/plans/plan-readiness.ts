import type { PlanDetail } from './entities/plan-detail.entity';
import type {
  PlanPreparationTaskDto,
  PlanReadinessDto,
  PlanReadinessStage,
} from './dto/plan-readiness.dto';

/** Groups from this size should book a table; a recommendation, not a blocker. */
export const RESERVATION_SUGGESTED_FROM_PEOPLE = 6;

const STAGE_COPY: Record<
  PlanReadinessStage,
  { label: string; summary: string }
> = {
  SUGGESTED: {
    label: 'Sugerido',
    summary: 'Es una propuesta: todavía no hay horarios para chequear.',
  },
  FEASIBLE: {
    label: 'Viable',
    summary:
      'Los horarios y recorridos son compatibles, pero faltan datos por confirmar.',
  },
  VERIFIED: {
    label: 'Verificado',
    summary: 'Horarios y precios tienen evidencia suficiente.',
  },
  PREPARATION_REQUIRED: {
    label: 'Falta preparar',
    summary: 'Está verificado, pero queda una reserva o entrada por resolver.',
  },
  READY: {
    label: 'Listo',
    summary: 'Verificado y sin nada pendiente: podés salir.',
  },
};

function uncertain(detail: PlanDetail): string[] {
  const value = detail.estimateBasis?.uncertain;
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** A stop is verified only when its planner snapshot says hours and price are known. */
function isVerifiedStop(detail: PlanDetail): boolean {
  if (!detail.estimateBasis) return false;
  const open = uncertain(detail);
  return !open.includes('hours_unknown') && !open.includes('price_unknown');
}

function screeningOf(detail: PlanDetail): {
  startsAt: string;
  bookingUrl: string | null;
  sourceUrl: string | null;
} | null {
  const value = detail.estimateBasis?.screening;
  if (!value || typeof value !== 'object') return null;
  const screening = value as Record<string, unknown>;
  if (typeof screening.startsAt !== 'string') return null;
  return {
    startsAt: screening.startsAt,
    bookingUrl:
      typeof screening.bookingUrl === 'string' ? screening.bookingUrl : null,
    sourceUrl:
      typeof screening.sourceUrl === 'string' ? screening.sourceUrl : null,
  };
}

function isMealStop(detail: PlanDetail): boolean {
  const action = detail.action ?? detail.activity?.type ?? null;
  return action === 'meal';
}

/** The pending steps a stop needs before the outing can really happen. */
export function preparationTaskOf(
  detail: PlanDetail,
  peopleCount: number,
  label: string,
): PlanPreparationTaskDto | null {
  const confirmedAt = detail.preparationConfirmedAt ?? null;
  const screening = screeningOf(detail);
  if (screening) {
    return {
      detailId: detail.id,
      kind: 'TICKET',
      required: true,
      label: `Entradas para ${label}`,
      status: confirmedAt ? 'CONFIRMED' : 'PENDING',
      confirmedAt,
      // An available link is not a purchase: only the user can confirm it.
      actionUrl: screening.bookingUrl ?? screening.sourceUrl,
      confirmedBy: confirmedAt ? 'USER' : null,
      actionLabel: screening.bookingUrl
        ? 'Comprar en el sitio del cine'
        : 'Ver la cartelera oficial',
    };
  }
  if (isMealStop(detail) && peopleCount >= RESERVATION_SUGGESTED_FROM_PEOPLE) {
    return {
      detailId: detail.id,
      kind: 'RESERVATION',
      required: false,
      label: `Reservar mesa para ${peopleCount} en ${label}`,
      status: confirmedAt ? 'CONFIRMED' : 'PENDING',
      confirmedAt,
      actionUrl: null,
      confirmedBy: confirmedAt ? 'USER' : null,
      actionLabel: null,
    };
  }
  return null;
}

/**
 * How prepared an outing really is. Never `READY` while a required task is
 * unconfirmed, and never from an available link alone.
 */
export function computePlanReadiness(
  details: readonly PlanDetail[],
  peopleCount: number,
  labelOf: (detail: PlanDetail) => string,
  missingExperiences: readonly string[] = [],
): PlanReadinessDto {
  const ordered = [...details].sort((a, b) => a.order - b.order);
  const tasks = ordered
    .map((detail) => preparationTaskOf(detail, peopleCount, labelOf(detail)))
    .filter((task): task is PlanPreparationTaskDto => task !== null);

  const timed =
    ordered.length > 0 && ordered.every((d) => d.startMinute !== null);
  const verifiedStops = ordered.filter(isVerifiedStop).length;
  const verified = ordered.length > 0 && verifiedStops === ordered.length;
  const blocking = tasks.filter(
    (task) => task.required && task.status !== 'CONFIRMED',
  );

  // A plan that leaves out something the person asked for is never ready.
  const incomplete = missingExperiences.length > 0;
  let stage: PlanReadinessStage = timed ? 'FEASIBLE' : 'SUGGESTED';
  if (verified) {
    stage =
      blocking.length > 0
        ? 'PREPARATION_REQUIRED'
        : incomplete
          ? 'VERIFIED'
          : 'READY';
  }

  const copy = STAGE_COPY[stage];
  const pendingSummary =
    blocking.length > 0
      ? `Falta resolver ${blocking.length === 1 ? 'un paso' : `${blocking.length} pasos`} antes de salir.`
      : null;
  return {
    stage,
    label: copy.label,
    summary: incomplete
      ? `El plan no cubre todo lo que pediste (falta ${missingExperiences.join(' y ')}).${pendingSummary ? ` ${pendingSummary}` : ''}`
      : !verified && pendingSummary
        ? `${copy.summary} ${pendingSummary}`
        : (pendingSummary ?? copy.summary),
    ready: stage === 'READY' && !incomplete,
    verifiedStops,
    totalStops: ordered.length,
    tasks,
  };
}
