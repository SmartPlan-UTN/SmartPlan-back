import type { PlanCandidate } from '../candidate';
import type { PlanIntent } from '../intent/plan-intent';
import { APPLY_CONFIDENCE, FACET_TRAITS, facetKey } from '../intent/semantics';
import { quotableEvidence } from './traits';

/** A type or name hint cannot substantiate an explicitly requested atmosphere. */
export function hasUnconfirmedContext(
  intent: PlanIntent,
  candidates: readonly PlanCandidate[],
): boolean {
  return (intent.facets ?? []).some((facet) => {
    if (
      facet.polarity !== 'want' ||
      facet.confidence < APPLY_CONFIDENCE ||
      !['text', 'explicit'].includes(facet.provenance) ||
      !['style', 'energy', 'social', 'goal'].includes(facet.dimension)
    )
      return false;
    const traits = FACET_TRAITS[facetKey(facet)] ?? [];
    return (
      traits.length > 0 &&
      !candidates.some((candidate) =>
        traits.some((trait) =>
          quotableEvidence(
            candidate.traits.filter(
              (evidence) =>
                !(trait === 'premium' && evidence.source === 'MENU_DERIVED'),
            ),
            trait,
          ),
        ),
      )
    );
  });
}
