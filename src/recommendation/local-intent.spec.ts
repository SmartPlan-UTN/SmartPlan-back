import { localIntent } from './local-intent';
import { InterpretIntentInput } from './gemini/dto/interpret-intent.dto';

const input = (rawQuery: string): InterpretIntentInput => ({
  rawQuery,
  context: {},
  candidateDepartments: [{ id: 1, name: 'Godoy Cruz' }],
  candidateCategories: [{ id: 1, name: 'Culture' }],
});

describe('Local intent extraction (CU17)', () => {
  it.each([
    '¿Hacemos algo hoy a la noche? No tengo nada en mente.',
    'Tengo ganas de salir esta noche, ¿qué hay para hacer por Mendoza?',
    'Quiero una salida tranquila hoy a la noche.',
    'Che, juntada con amigos hoy a la noche. ¿Qué se te ocurre?',
    'Somos varios y queremos comer algo rico, ¿a dónde podemos ir?',
    'Tenemos ganas de tomar algo y charlar tranqui.',
    'Quiero invitar a alguien a salir y no se me ocurre nada.',
    'Una cita linda para dos, con hasta $80.000 entre los dos. ¿Qué puede funcionar?',
    'Cena y cine esta noche. Elegí vos una peli de la cartelera y decime qué horarios hay y cuánto sale.',
    'Me dio hambre: quiero comer algo rico y sin tantas vueltas.',
    'Tengo ganas de una buena pizza esta noche, ¿qué me recomendás?',
    '¿Un lugar lindo para merendar y después dar una vuelta?',
    'Necesito salir un rato, ¿qué lugar lindo hay al aire libre?',
    '¿Dónde podemos ver el atardecer hoy?',
    'Algo para hacer afuera este finde, tranqui.',
    'No quiero gastar mucho, pero sí salir. ¿Qué hacemos?',
    '¿Un plan lindo y barato para este finde?',
    'Tenemos poca plata para salir los dos; ¿qué puede salir?',
    '¿Qué hay cerca para hacer ahora?',
    'Tengo ganas de salir, pero no quiero irme lejos.',
    '¿Qué hay cerca para hacer hoy? No tengo ganas de manejar.',
  ])('understands a complete landing suggestion locally: %s', (query) => {
    const result = localIntent(input(query), true);
    expect(result.unknownTerms).toEqual([]);
    expect(result.unresolvedNegations).toEqual([]);
    expect(result.needsModel).toBe(false);
  });

  it('understands an open ended date invitation without treating normal words as errors', () => {
    const result = localIntent(
      input('Quiero invitar a alguien a salir y no se me ocurre nada.'),
      true,
    );
    expect(result.needsModel).toBe(false);
    expect(result.unknownTerms).toEqual([]);
    expect(result.intent.partySize).toBe(2);
    expect(result.partySizeInferred).toBe(true);
  });

  it.each([
    'sin movernos mucho',
    'no nos queremos mover mucho',
    'no queremos movernos mucho',
    'no queremos manejar mucho',
  ])('keeps the supported group travel constraint local: %s', (phrase) => {
    expect(
      localIntent(input(`Cena mañana para dos personas ${phrase}`), true)
        .needsModel,
    ).toBe(false);
  });
  it('uses the planning vocabulary locally without inventing a location or overriding the couple', () => {
    const result = localIntent(
      input(
        'Quiero sorprender a mi novia mañana, algo romántico, tenemos $80.000 entre los dos y no quiero manejar mucho',
      ),
      true,
    );
    expect(result.needsModel).toBe(false);
    expect(result.intent).toMatchObject({
      partySize: 2,
      budget: 80000,
      departmentName: null,
    });
    expect(localIntent(input('no quiero cenar'), true).needsModel).toBe(true);
  });
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

  it('resolves a generic Mendoza city-center request locally', () => {
    const result = localIntent(
      {
        ...input('Algo para hacer hoy a la noche, cerca del centro'),
        candidateDepartments: [{ id: 1, name: 'Ciudad de Mendoza' }],
      },
      true,
    );

    expect(result).toMatchObject({
      needsModel: false,
      unknownTerms: [],
      intent: {
        departmentName: 'Ciudad de Mendoza',
        timeOfDay: 'evening',
      },
    });
  });

  it('keeps a named department when the request says its center', () => {
    const result = localIntent(
      input('Algo para hacer en el centro de Godoy Cruz'),
      true,
    );

    expect(result).toMatchObject({
      needsModel: false,
      unknownTerms: [],
      intent: { departmentName: 'Godoy Cruz' },
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
