/**
 * Language evaluation suite: how SmartPlan reads the way people really talk
 * (Argentine / Mendoza Spanish: slang, typos, shorthand, indirect asks,
 * negation, relative budgets). Every case asserts the SEMANTIC reading —
 * action, style, energy, refusals, company, price attitude — never a venue,
 * so it survives catalog changes.
 *
 * This is the regression net for the phrase reader. The language model sits
 * behind it for what the reader cannot place; cases that need the model are
 * marked `needsModel` and asserted to be sent to it (not silently mapped).
 */
import { localIntent } from '../../recommendation/local-intent';
import { buildPlanIntent } from './build-intent';
import type { PlanIntent } from './plan-intent';
import { facetKey, APPLY_CONFIDENCE } from './semantics';
import { buildPlanShape } from '../shape/plan-shape';
import { echoOf, understandingOf } from './understanding';

interface Expectation {
  /** Required experiences that must be planned. */
  exp?: string[];
  /** Experiences that must NOT appear (the false readings we saw in QA). */
  noExp?: string[];
  /** Facets the person asked for, `dimension.value`. */
  want?: string[];
  /** Facets the person refused. */
  avoid?: string[];
  occasion?: PlanIntent['occasion'];
  price?: PlanIntent['pricePreference'];
  indoor?: boolean;
  kinds?: string[];
  /** The reader cannot place something: the model must be consulted. */
  needsModel?: boolean;
  /** Food words steered away from. */
  keywords?: string[];
}

const AT = new Date('2026-10-17T17:16:19Z'); // Saturday 14:16 in Mendoza

function interpret(query: string) {
  const local = localIntent(
    {
      rawQuery: query,
      context: {},
      candidateDepartments: [{ id: 1, name: 'Ciudad de Mendoza' }],
      candidateCategories: [],
    },
    true,
  );
  const intent = buildPlanIntent({
    rawQuery: query,
    requestedAt: AT,
    budget: null,
    partySize: local.intent.partySize,
    availableDuration: null,
    timeOfDay: local.intent.timeOfDay,
    travelMode: 'drive',
    latitude: null,
    longitude: null,
    radiusKm: null,
    idDepartment: 1,
    categoryIds: [],
    excludedCategoryIds: [],
    sources: {
      budget: null,
      partySize: local.intent.partySize
        ? local.partySizeInferred
          ? 'inferred'
          : 'text'
        : null,
      duration: null,
      location: 'default',
    },
  });
  return { local, intent, understanding: understandingOf(intent, AT) };
}

const CASES: [string, Expectation][] = [
  // ── the QA failure and its neighbours ──────────────────────────────────
  [
    'Un lugar fachero para tomar algo',
    { exp: ['drinks'], noExp: ['walk'], want: ['style.stylish'] },
  ],
  [
    'salir al cine y depsues a comer algo',
    { exp: ['movie', 'dinner'], needsModel: false },
  ],
  [
    '"Un lugar  fachero para tomar algo"',
    { exp: ['drinks'], noExp: ['walk'], want: ['style.stylish'] },
  ],
  [
    'un lugar fachro pa tomar algo',
    { exp: ['drinks'], want: ['style.stylish'] },
  ],
  ['un sitio facheron para tomar algo', { exp: ['drinks'] }],
  [
    'Un lugar con onda para tomar algo',
    { exp: ['drinks'], want: ['style.stylish'], noExp: ['walk'] },
  ],
  // ── slang for the action ───────────────────────────────────────────────
  ['tomar algo', { exp: ['drinks'] }],
  ['Un café de especialidad tranquilo', { exp: ['merienda'], noExp: ['walk'] }],
  ['vamos a tomar unas', { exp: ['drinks'] }],
  ['salir a escabiar', { exp: ['drinks'] }],
  ['una previa', { exp: ['drinks'], want: ['food_drink.pre_drinks'] }],
  ['hacemos la previa en algún lado', { exp: ['drinks'] }],
  ['un vermutcito', { exp: ['drinks'], want: ['food_drink.vermouth'] }],
  [
    'un vermú con picada',
    { exp: ['drinks'], want: ['food_drink.sharing_food'] },
  ],
  ['una birra con los pibes', { exp: ['beer'], occasion: 'friends' }],
  ['una birrita', { exp: ['beer'] }],
  ['una cerveza artesanal', { exp: ['beer'], want: ['food_drink.craft_beer'] }],
  [
    'una birra y algo para picar',
    { exp: ['beer'], want: ['food_drink.sharing_food'] },
  ],
  ['un trago en un rooftop', { exp: ['drinks'], want: ['style.rooftop'] }],
  ['un fernet con amigos', { exp: ['drinks'], occasion: 'friends' }],
  ['una cenita', { exp: ['dinner'] }],
  ['vamos a morfar algo', { needsModel: true }],
  ['quiero cenar sushi', { exp: ['dinner'], want: ['food_drink.sushi'] }],
  ['un brunch tranqui', { exp: ['brunch'], want: ['energy.quiet'] }],
  ['un cafecito', { exp: ['merienda'] }],
  ['una merienda con mi vieja', { exp: ['merienda'], occasion: 'family' }],
  // ── style and vibe ─────────────────────────────────────────────────────
  [
    'un barcito tranqui para charlar',
    { exp: ['drinks'], want: ['energy.quiet', 'social.conversation_friendly'] },
  ],
  ['algún barcito tranqui', { exp: ['drinks'], want: ['energy.quiet'] }],
  [
    'algo con onda con los pibes',
    { occasion: 'friends', want: ['style.stylish'], noExp: ['walk'] },
  ],
  [
    'bar con onda para charlar',
    {
      exp: ['drinks'],
      want: ['social.conversation_friendly'],
      noExp: ['dancing'],
    },
  ],
  [
    'lugar con onda para salir con amigos',
    { occasion: 'friends', want: ['style.stylish', 'energy.social'] },
  ],
  [
    'algo cheto pero no careta',
    { want: ['style.elegant'], avoid: ['style.pretentious'] },
  ],
  ['algo copado', { noExp: ['walk'] }],
  ['algo piola con mi novia', { occasion: 'romantic' }],
  ['un lugar canchero', { want: ['style.modern'] }],
  ['algo moderno y distinto', { want: ['style.modern', 'goal.different'] }],
  ['un lugar acogedor', { want: ['style.cozy'] }],
  ['algo íntimo', { want: ['style.intimate'] }],
  ['un lugar bohemio', { want: ['style.alternative'] }],
  ['algo rústico en el campo', { want: ['style.rustic'] }],
  ['algo con vista', { want: ['style.scenic'] }],
  ['un patio cervecero', { want: ['style.garden'] }],
  ['algo tradicional de toda la vida', { want: ['style.traditional'] }],
  ['algo sofisticado', { want: ['style.elegant'] }],
  ['algo informal', { want: ['style.casual'] }],
  ['sin tanta vuelta', { want: ['style.casual'] }],
  // ── negation and refusals ──────────────────────────────────────────────
  [
    'con onda pero no boliche',
    {
      want: ['style.stylish'],
      avoid: ['social.nightclub'],
      kinds: ['nightclub'],
      noExp: ['dancing'],
    },
  ],
  [
    'algo con música pero no boliche',
    {
      want: ['social.music'],
      avoid: ['social.nightclub'],
      kinds: ['nightclub'],
      noExp: ['dancing'],
    },
  ],
  [
    'romántico pero no cheto',
    { want: ['goal.romantic'], avoid: ['style.elegant'] },
  ],
  [
    'algo cultural que no sea museo',
    { exp: ['culture'], noExp: ['museum'], kinds: ['museum'] },
  ],
  [
    'no quiero comer otra hamburguesa',
    { avoid: ['food_drink.burgers'], keywords: ['hamburgues'] },
  ],
  ['quiero comer algo pero no pizza', { avoid: ['food_drink.pizza'] }],
  ['un bar sin ruido', { exp: ['drinks'], want: ['energy.quiet'] }],
  ['que no sea ruidoso', { want: ['energy.quiet'] }],
  ['comer bien pero informal', { want: ['style.casual'] }],
  [
    'no quiero comer, quiero hacer algo',
    { noExp: ['dinner', 'lunch', 'meal'] },
  ],
  // ── budget, colloquial ─────────────────────────────────────────────────
  [
    'una cena linda pero sin dejar un riñón',
    { exp: ['dinner'], want: ['economic.moderate'], price: 'value' },
  ],
  [
    'una cita linda pero no tan cara',
    { occasion: 'romantic', want: ['economic.moderate'], price: 'value' },
  ],
  ['lindo pero barato', { want: ['economic.budget'], price: 'cheap' }],
  ['algo barato', { want: ['economic.budget'], price: 'cheap' }],
  ['algo baratísimo', { want: ['economic.very_cheap'], price: 'cheap' }],
  ['con poca plata', { price: 'cheap' }],
  ['sin gastar mucho', { want: ['economic.moderate'], price: 'value' }],
  ['calidad precio', { want: ['economic.value_for_money'], price: 'value' }],
  ['que la plata no sea problema', { want: ['economic.no_budget_limit'] }],
  ['algo premium', { price: 'premium' }],
  // ── occasion and company ───────────────────────────────────────────────
  ['quiero sorprenderla', { want: ['goal.surprising'], occasion: 'romantic' }],
  [
    'quiero sorprender a mi novia',
    { want: ['goal.surprising'], occasion: 'romantic' },
  ],
  ['primera cita', { occasion: 'first_date' }],
  [
    'algo lindo para llevar a mis viejos',
    { occasion: 'family', noExp: ['family_fun'] },
  ],
  ['con mis suegros', { occasion: 'family', noExp: ['family_fun'] }],
  ['con los nenes', { occasion: 'family', exp: [] }],
  ['salida de after office', { occasion: 'after_work' }],
  ['cumple de mi amiga', { occasion: 'celebration' }],
  ['con los muchachos del laburo', { occasion: 'friends' }],
  // ── energy / emotional / goal ──────────────────────────────────────────
  ['quiero salir de joda', { exp: ['drinks'], want: ['energy.high_energy'] }],
  ['algo para cagarnos de risa', { exp: ['fun'], want: ['goal.laugh'] }],
  ['algo para reírnos un rato', { exp: ['fun'], want: ['goal.laugh'] }],
  ['quiero adrenalina', { exp: ['adventure'], want: ['goal.adventurous'] }],
  ['algo para relajarnos', { want: ['goal.relaxing'] }],
  ['necesito desconectar', { want: ['goal.relaxing'] }],
  ['algo bien distinto', { want: ['goal.different'] }],
  ['algo auténtico, de acá', { want: ['goal.local_authentic'] }],
  ['alguna joyita escondida', { want: ['novelty.hidden_gem'] }],
  ['un lugar poco conocido', { want: ['novelty.hidden_gem'] }],
  ['un clásico imperdible', { want: ['novelty.iconic'] }],
  ['un lugar recién abierto', { want: ['novelty.new_place'] }],
  // ── setting and weather ────────────────────────────────────────────────
  ['algo bajo techo porque está feo', { indoor: true }],
  ['algo para hacer si llueve', { indoor: true }],
  ['hace un calor insoportable, algo adentro', { indoor: true }],
  [
    'algo de montaña sin matarme',
    { exp: ['adventure'], want: ['setting.easy_effort'] },
  ],
  ['algo al aire libre', { want: ['setting.outdoor'] }],
  // ── indirect / vague asks ──────────────────────────────────────────────
  ['qué pinta hoy', { noExp: ['beer', 'walk'] }],
  ['no sé, algo para hacer', {}],
  ['algo donde se pueda charlar', { want: ['social.conversation_friendly'] }],
  [
    'quiero ir a un lugar donde se pueda charlar tranquilos',
    { want: ['social.conversation_friendly', 'energy.quiet'] },
  ],
  ['ke onda, algo piola', { noExp: ['walk'] }],
  // ── things the reader must NOT silently map ────────────────────────────
  ['algo zarpado con la gorda', { noExp: ['walk'] }],
  ['quiero un lugar mortadela', { needsModel: true }],
];

describe('language evaluation corpus', () => {
  it('is a broad corpus, not a sanitized handful', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(90);
  });

  it.each(CASES)('reads «%s»', (query, expectation) => {
    const { local, intent, understanding } = interpret(query);
    const experiences = intent.experiences.map(({ key }) => key);
    const applied = (intent.facets ?? []).filter(
      (facet) => facet.confidence >= APPLY_CONFIDENCE,
    );
    const wanted = applied
      .filter((facet) => facet.polarity === 'want')
      .map(facetKey);
    const refused = applied
      .filter((facet) => facet.polarity === 'avoid')
      .map(facetKey);

    for (const key of expectation.exp ?? []) expect(experiences).toContain(key);
    for (const key of expectation.noExp ?? [])
      expect(experiences).not.toContain(key);
    for (const key of expectation.want ?? []) expect(wanted).toContain(key);
    for (const key of expectation.avoid ?? []) expect(refused).toContain(key);
    for (const key of expectation.kinds ?? [])
      expect(intent.excludedKinds).toContain(key);
    for (const word of expectation.keywords ?? [])
      expect(intent.avoidKeywords).toContain(word);
    if (expectation.occasion !== undefined)
      expect(intent.occasion).toBe(expectation.occasion);
    if (expectation.price !== undefined)
      expect(intent.pricePreference).toBe(expectation.price);
    if (expectation.indoor !== undefined)
      expect(intent.constraints.indoorOnly).toBe(expectation.indoor);
    if (expectation.needsModel !== undefined)
      expect(local.needsModel).toBe(expectation.needsModel);

    // Provenance: a chip is never a default dressed up as the person's words.
    const saidParty = /\b(\d+|dos|tres|cuatro|somos|personas)\b/i.test(query);
    const saidWhen =
      /\b(hoy|mañana|manana|ahora|noche|tarde|sábado|domingo|lunes|martes|miércoles|jueves|viernes)\b/i.test(
        query,
      );
    for (const chip of understanding.chips) {
      expect(chip.source).not.toBe('default');
      if (chip.key === 'when' && !saidWhen) throw new Error('claimed a date');
      if (chip.key === 'party' && !saidParty && chip.source === 'text')
        throw new Error('claimed a party size as said');
    }
  });

  it('keeps the six acceptance queries meaningfully different', () => {
    const queries = [
      'Un lugar fachero para tomar algo',
      'Un barcito tranqui para charlar',
      'Algo con onda con los pibes',
      'Algo cheto pero no careta',
      'Una birra y algo para picar',
      'Una cita linda pero no tan cara',
      'Algo con música pero no boliche',
    ];
    const signatures = queries.map((query) => {
      const { intent } = interpret(query);
      return JSON.stringify({
        experiences: intent.experiences.map(({ key }) => key),
        facets: (intent.facets ?? []).map(
          (facet) => `${facet.polarity}:${facetKey(facet)}`,
        ),
        occasion: intent.occasion,
        price: intent.pricePreference,
      });
    });
    expect(new Set(signatures).size).toBe(queries.length);
  });
});

describe('«con onda» depends on its context', () => {
  const energy = (query: string) =>
    (interpret(query).intent.facets ?? [])
      .filter((facet) => facet.dimension === 'energy')
      .map(facetKey);

  it('is never high energy by itself', () => {
    for (const query of [
      'bar con onda',
      'algo con onda',
      'bar con onda para charlar',
      'cena con onda con mi novia',
    ])
      expect(energy(query)).not.toContain('energy.high_energy');
  });

  it('does not make a conversation spot lively', () => {
    expect(energy('bar con onda para charlar')).toEqual([]);
    const { intent } = interpret('bar con onda para charlar');
    expect(intent.vibe).not.toContain('lively');
  });

  it('allows a social register when friends go out', () => {
    expect(energy('lugar con onda para salir con amigos')).toContain(
      'energy.social',
    );
  });
});

describe('unknown language is reported, not forced onto a concept', () => {
  it('returns unmapped words so they can be reviewed', () => {
    const { local, intent } = interpret('quiero un lugar mortadela');
    expect(local.unknownTerms).toContain('mortadela');
    expect(local.needsModel).toBe(true);
    expect(intent.experiences).toEqual([]);
    expect(intent.facets).toEqual([]);
  });

  it('does not repair a word onto an unrelated anchor', () => {
    const { local } = interpret('mortadelas');
    expect(local.unknownTerms.length).toBeGreaterThan(0);
  });
});

describe('intent provenance', () => {
  it('does not claim a date or a party size nobody gave', () => {
    const { intent, understanding } = interpret(
      'Un lugar fachero para tomar algo',
    );
    expect(intent.provenance.party).toBe('default');
    expect(intent.provenance.when).not.toBe('text');
    expect(understanding.chips.map((chip) => chip.key)).not.toContain('party');
    expect(understanding.chips.map((chip) => chip.key)).not.toContain('when');
    expect(understanding.missing).toEqual(['when', 'budget', 'party']);
  });

  it('shows the person’s own slang back to them', () => {
    const { understanding } = interpret('Un lugar fachero para tomar algo');
    expect(understanding.chips.map((chip) => chip.label)).toEqual([
      'Tomar algo',
      'Fachero',
    ]);
  });

  it('marks a reasonable deduction as inferred, not as said', () => {
    const { intent } = interpret('quiero sorprenderla');
    expect(intent.provenance.occasion).toBe('inferred');
    expect(intent.provenance.party).toBe('inferred');
  });
});

describe('what is said back', () => {
  const echo = (query: string) => {
    const { understanding } = interpret(query);
    return echoOf(understanding);
  };

  it('reads like the person’s own sentence', () => {
    expect(echo('Un lugar fachero para tomar algo')).toBe(
      'Pediste algo fachero para tomar algo.',
    );
    expect(echo('Un barcito tranqui para charlar')).toBe(
      'Pediste algo tranqui para tomar algo y charlar.',
    );
    expect(echo('Algo cheto pero no careta')).toBe(
      'Pediste algo cheto, sin pretensión.',
    );
    expect(echo('Una birra y algo para picar')).toBe(
      'Pediste una birra y algo para picar.',
    );
    expect(echo('Algo con música pero no boliche')).toBe(
      'Pediste algo con música para tomar algo, sin boliche.',
    );
  });
});

describe('a style word never becomes a walk', () => {
  it.each([
    'algo cheto pero no careta',
    'algo con onda',
    'algo copado',
    'alguna joyita escondida',
    'algo fachero',
  ])('«%s» plans no paseo', (query) => {
    const { intent } = interpret(query);
    const shape = buildPlanShape(intent, AT);
    const planned = shape.slots
      .filter((slot) => slot.role === 'ANCHOR')
      .flatMap((slot) => slot.experiences);
    expect(planned).not.toContain('walk');
  });
});

describe('a night out', () => {
  it('is a bar first, with the dance floor as an optional follow-up', () => {
    const { intent } = interpret('quiero salir de joda');
    const shape = buildPlanShape(intent, AT);
    const anchors = shape.slots.filter((slot) => slot.role === 'ANCHOR');
    expect(anchors.flatMap((slot) => slot.experiences)).toEqual(['drinks']);
    const dancing = shape.slots.find((slot) =>
      slot.experiences.includes('dancing'),
    );
    expect(dancing?.required).toBe(false);
  });
});

describe('vague everyday context still produces a usable reading', () => {
  it('turns unwind/social context into a small inferred outing', () => {
    const { local, intent } = interpret('algo tranqui para cortar la semana');
    expect(local.needsModel).toBe(false);
    expect(local.unknownTerms).toEqual([]);
    expect(intent.facets?.map(facetKey)).toEqual(
      expect.arrayContaining(['goal.relaxing', 'energy.quiet']),
    );
    expect(intent.experiences).toContainEqual({
      key: 'merienda',
      required: false,
    });
  });

  it('understands colloquial partner language without inventing an exact activity', () => {
    const { local, intent } = interpret(
      'salir con mi chica a hacer algo distinto',
    );
    expect(local.needsModel).toBe(false);
    expect(intent.occasion).toBe('romantic');
    expect(intent.party).toEqual({ size: 2, composition: 'couple' });
    expect(intent.provenance.party).toBe('inferred');
    expect(intent.facets?.map(facetKey)).toContain('goal.different');
    expect(intent.experiences.every(({ required }) => !required)).toBe(true);
  });

  it('reads a casual after-work meetup as a group and labels the minimum honestly', () => {
    const { local, intent, understanding } = interpret(
      'me junto con los chicos después del laburo, hoy a la noche',
    );
    expect(local.needsModel).toBe(false);
    expect(intent.occasion).toBe('after_work');
    expect(intent.party).toEqual({ size: 2, composition: 'group' });
    expect(intent.provenance.party).toBe('inferred');
    expect(intent.vibe).not.toContain('quiet');
    expect(intent.facets?.map(facetKey)).toContain('social.good_for_groups');
    expect(intent.experiences).toContainEqual({
      key: 'drinks',
      required: false,
    });
    expect(
      understanding.chips.find((chip) => chip.key === 'party')?.label,
    ).toBe('Grupo · desde 2');
  });

  it('reads written headcounts and soft crowd preferences locally', () => {
    const two = interpret('una salida sencilla y barata para dos');
    expect(two.local.needsModel).toBe(false);
    expect(two.intent.party.size).toBe(2);
    expect(two.intent.provenance.party).toBe('text');
    expect(two.intent.pricePreference).toBe('cheap');
    expect(two.intent.facets?.map(facetKey)).toContain('style.casual');

    const beer = interpret(
      'quiero una birra en algún lugar con onda pero no muy lleno',
    );
    expect(beer.local.needsModel).toBe(false);
    expect(beer.intent.experiences.map(({ key }) => key)).toContain('beer');
    expect(beer.intent.vibe).toContain('quiet');
    expect(beer.local.unresolvedNegations).toEqual([]);
  });
});
