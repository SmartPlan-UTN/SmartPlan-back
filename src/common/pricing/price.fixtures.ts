import { PriceFields, UNKNOWN_PRICE } from './price';

/** Test helper: a curated FIXED price with the legacy "added as-is" unit. */
export function fixedPrice(amount: number): PriceFields {
  return {
    priceKind: 'FIXED',
    priceMin: amount,
    priceMax: amount,
    priceUnit: 'UNSPECIFIED',
    priceCurrency: 'ARS',
    priceSource: 'CURATED',
    priceSourceRef: null,
    priceVerifiedAt: null,
  };
}

export { UNKNOWN_PRICE };
