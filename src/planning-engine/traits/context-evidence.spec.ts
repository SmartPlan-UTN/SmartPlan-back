import { intentFor, placeAction } from '../testing/fixtures';
import { hasUnconfirmedContext } from './context-evidence';

describe('requested atmosphere evidence', () => {
  it('requires real evidence for a romantic request, even when the venue name hints at it', () => {
    const intent = intentFor('cena romántica');
    const candidate = placeAction();
    candidate.traits = [
      {
        trait: 'romantic',
        score: 1,
        confidence: 0.8,
        source: 'NAME',
        evidence: 'Bistró',
      },
    ];
    expect(hasUnconfirmedContext(intent, [candidate])).toBe(true);
    candidate.traits = [
      {
        trait: 'romantic',
        score: 1,
        confidence: 0.9,
        source: 'CURATED',
        evidence: 'Ambiente romántico documentado',
      },
    ];
    expect(hasUnconfirmedContext(intent, [candidate])).toBe(false);
  });

  it('does not invent an atmosphere requirement for a plain dinner', () => {
    expect(hasUnconfirmedContext(intentFor('cena'), [placeAction()])).toBe(
      false,
    );
  });

  it('does not equate an expensive menu with a premium atmosphere', () => {
    const candidate = placeAction({
      traits: [
        {
          trait: 'premium',
          score: 0.9,
          confidence: 0.9,
          source: 'MENU_DERIVED',
          evidence: 'Expensive mains',
        },
      ],
    });
    expect(hasUnconfirmedContext(intentFor('algo premium'), [candidate])).toBe(
      true,
    );
  });
});
