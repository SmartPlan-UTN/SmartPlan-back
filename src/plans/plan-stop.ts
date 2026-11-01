import { isHomePlace } from '../catalog/home-place';
import { activitySubtypeLabel, placeKindLabel } from '../catalog/taxonomy';
import type { Place } from '../places/entities/place.entity';
import type { PlanStopDto, PlanStopPlaceDto } from './dto/plan-stop.dto';
import type { PlanDetail } from './entities/plan-detail.entity';

function placeDto(place: Place | null | undefined): PlanStopPlaceDto | null {
  if (!place) return null;
  return {
    id: place.id,
    name: place.name,
    address: place.address ?? null,
    kind: place.kind ?? null,
    kindLabel: placeKindLabel(place.kind),
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    googlePlaceId: place.googlePlaceId ?? null,
    departmentName: place.department?.name ?? null,
    atHome: isHomePlace(place),
  };
}

/** The label of a place-action stop: "Cena en X", "Café y merienda en Y". */
export function placeActionLabel(
  detail: Pick<PlanDetail, 'action' | 'estimateBasis'>,
  placeName: string,
): string {
  // A screening (or any stop) whose own label was frozen when planned.
  if (typeof detail.estimateBasis?.stopLabel === 'string')
    return detail.estimateBasis.stopLabel;
  const experienceLabel =
    typeof detail.estimateBasis?.experienceLabel === 'string'
      ? detail.estimateBasis.experienceLabel
      : null;
  const verb =
    experienceLabel ?? activitySubtypeLabel(detail.action) ?? 'Visita';
  return `${verb} en ${placeName}`;
}

/** The display name of a stop for summaries ("activityNames"). */
export function stopName(detail: PlanDetail): string {
  if (detail.activity) return detail.activity.name;
  return placeActionLabel(detail, detail.place?.name ?? 'un lugar');
}

/** Unified stop view of a plan detail (relations loaded when available). */
export function stopOf(detail: PlanDetail): PlanStopDto {
  const timeline = {
    startMinute: detail.startMinute ?? null,
    legTravelMinutes: detail.legTravelMinutes ?? null,
    legDistanceMeters: detail.legDistanceMeters ?? null,
    estimateBasis: detail.estimateBasis ?? null,
  };
  if (detail.activity) {
    const place =
      detail.place ??
      detail.activity.places?.find((location) => location.deletedAt === null)
        ?.place ??
      detail.activity.places?.[0]?.place ??
      null;
    return {
      kind: 'OFFERING',
      label: detail.activity.name,
      action: detail.activity.type ?? null,
      actionLabel: activitySubtypeLabel(detail.activity.type),
      activityId: detail.activity.id,
      place: placeDto(place),
      ...timeline,
    };
  }
  return {
    kind: 'PLACE_ACTION',
    label: placeActionLabel(detail, detail.place?.name ?? 'un lugar'),
    action: detail.action,
    actionLabel: activitySubtypeLabel(detail.action),
    activityId: null,
    place: placeDto(detail.place),
    ...timeline,
  };
}
