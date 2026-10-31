/**
 * One stop of a plan, whatever is behind it: a verified offering (an
 * Activity) or the intrinsic action of a place (dinner at a restaurant).
 * Every plan response carries it next to the legacy `activity` field, which
 * stays filled for offering stops and is `null` for place-action stops.
 */
export interface PlanStopPlaceDto {
  id: number;
  name: string;
  address: string | null;
  kind: string | null;
  kindLabel: string | null;
  /** SmartPlan-owned position only (never provider content). */
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string | null;
  departmentName: string | null;
  /** The Hogar ("En casa / donde estén"): no address, map or distance. */
  atHome: boolean;
}

export interface PlanStopDto {
  kind: 'OFFERING' | 'PLACE_ACTION';
  /** What the person reads: the offering's name or "Cena en Anna Bistró". */
  label: string;
  /** Activity subtype (`meal`, `coffee`, `walk`) and its Spanish label. */
  action: string | null;
  actionLabel: string | null;
  activityId: number | null;
  place: PlanStopPlaceDto | null;
  /** Planned local start in minutes from the plan date's midnight. */
  startMinute: number | null;
  legTravelMinutes: number | null;
  legDistanceMeters: number | null;
  /** Why it costs what it shows and what is still uncertain. */
  estimateBasis: Record<string, unknown> | null;
}
