/**
 * The one rule for what a place-action stop is worth before evidence, shared
 * by the planner, the composer and plan persistence: a public space walk is
 * free by what the place is; anything else is UNKNOWN until a menu, an
 * official price or observed spend says otherwise. Never a guessed amount.
 */
import {
  intrinsicAction,
  type IntrinsicAction,
} from '../catalog/place-actionability';
import {
  DEFAULT_PRICE_CURRENCY,
  UNKNOWN_PRICE,
  type PriceFields,
} from '../common/pricing/price';

export const PUBLIC_SPACE_PRICE_REF = 'smartplan:public-space';

export const PUBLIC_SPACE_PRICE: PriceFields = {
  priceKind: 'FREE',
  priceMin: 0,
  priceMax: 0,
  priceUnit: 'PER_GROUP',
  priceCurrency: DEFAULT_PRICE_CURRENCY,
  priceSource: 'CURATED',
  priceSourceRef: PUBLIC_SPACE_PRICE_REF,
  priceVerifiedAt: null,
};

export function placeActionPrice(action: IntrinsicAction): PriceFields {
  return action.priceModel === 'PUBLIC_FREE'
    ? { ...PUBLIC_SPACE_PRICE }
    : { ...UNKNOWN_PRICE };
}

/** The intrinsic action a place supports for `action`, or null if it cannot be a stop. */
export function plannablePlaceAction(
  kind: string | null | undefined,
  action: string | null | undefined,
): IntrinsicAction | null {
  return action ? intrinsicAction(kind, action) : null;
}
