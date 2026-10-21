import { localIntent } from './local-intent';
import { InterpretIntentInput } from './gemini/dto/interpret-intent.dto';

const input = (rawQuery: string): InterpretIntentInput => ({
  rawQuery,
  context: {},
  candidateDepartments: [{ id: 1, name: 'Godoy Cruz' }],
  candidateCategories: [{ id: 1, name: 'Culture' }],
});

describe('Local intent extraction (CU17)', () => {
  it('resolves explicit numeric constraints and locality without reinterpreting context', () => {
    const result = localIntent({
      ...input(
        'Godoy Cruz por la tarde con 4 personas, presupuesto 20.000 pesos y 2 horas',
      ),
      context: { budget: 5000 },
    });
    expect(result.intent).toMatchObject({
      budget: 5000,
      partySize: 4,
      availableDuration: 120,
      departmentName: 'Godoy Cruz',
      timeOfDay: 'afternoon',
    });
  });

  it('does not confuse the group size or hours with a budget', () => {
    expect(
      localIntent(input('con 4 personas hasta 3 horas')).intent.budget,
    ).toBeNull();
  });

  it('keeps night and early morning consistent with the frontend labels', () => {
    expect(localIntent(input('por la noche')).intent.timeOfDay).toBe('evening');
    expect(localIntent(input('de madrugada')).intent.timeOfDay).toBe('night');
    expect(
      localIntent(input('mañana quiero salir')).intent.timeOfDay,
    ).toBeNull();
  });

  it('uses Gemini for ambiguous interests and negated categories', () => {
    expect(localIntent(input('algo romántico para cenar')).needsModel).toBe(
      true,
    );
    expect(localIntent(input('sin Culture')).needsModel).toBe(true);
  });

  it('recognizes thousands and an explicit radius', () => {
    expect(
      localIntent(input('presupuesto 20k hasta 5 km')).intent,
    ).toMatchObject({ budget: 20000, maxDistanceKm: 5 });
  });

  it('keeps travel mode, explicit exclusions and numeric group counts', () => {
    const result = localIntent(input('somos 4, caminando, sin Culture'));
    expect(result.intent).toMatchObject({
      partySize: 4,
      travelMode: 'walk',
      excludedCategoryNames: ['Culture'],
      categoryNames: [],
    });
  });
});
