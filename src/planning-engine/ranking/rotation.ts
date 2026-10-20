import type { PlanCandidate } from '../candidate';

/** Wide rotation is only useful when the entire eligible pool lacks evidence. */
export function rotationSpan(candidates: readonly PlanCandidate[]): number {
  const allUnknown =
    candidates.length > 0 &&
    candidates.every(
      (candidate) =>
        !candidate.hours &&
        candidate.price.priceKind === 'UNKNOWN' &&
        candidate.quality.rating === null &&
        !candidate.traits.some(
          (trait) => !['PRIOR', 'NAME'].includes(trait.source),
        ),
    );
  return allUnknown ? 0.05 : 0.012;
}
