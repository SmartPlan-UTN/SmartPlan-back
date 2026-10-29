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

  describe('occasions, at home and free (#135)', () => {
    it('reads a romantic plan with a partner without calling the model', () => {
      const { intent, needsModel } = localIntent(
        input('un plan romántico con mi novia'),
      );
      expect(intent.occasions).toEqual(['romantic']);
      expect(needsModel).toBe(false);
    });

    it('reads children as family and kids', () => {
      expect(localIntent(input('con los nenes')).intent.occasions).toEqual([
        'family',
        'kids',
      ]);
    });

    it('reads "sin gastar" as free, not as a negation', () => {
      const { intent, needsModel } = localIntent(
        input('juntada en casa con amigos sin gastar'),
      );
      expect(intent).toMatchObject({ atHome: true, freeOnly: true });
      expect(intent.occasions).toContain('friends');
      expect(needsModel).toBe(false);
    });

    it('reads a game night as at home, even without "en casa"', () => {
      expect(
        localIntent(input('noche de juegos con amigos')).intent,
      ).toMatchObject({ atHome: true });
      expect(localIntent(input('noche de bares')).intent.atHome).toBe(false);
    });

    it('takes the chips from the context as given', () => {
      const { intent } = localIntent({
        ...input('algo lindo'),
        context: { atHome: true, freeOnly: true, occasions: ['kids', 'nope'] },
      });
      expect(intent).toMatchObject({
        atHome: true,
        freeOnly: true,
        occasions: ['kids'],
      });
    });
  });
});
