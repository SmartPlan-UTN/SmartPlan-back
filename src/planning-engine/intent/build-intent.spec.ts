import { FRIDAY_AFTERNOON, intentFor } from '../testing/fixtures';
import { buildPlanShape, scheduleIntent } from '../shape/plan-shape';

describe('buildPlanIntent', () => {
  it('reads a romantic surprise for two, tomorrow, low travel (north-star query)', () => {
    const intent = intentFor(
      'Quiero sorprender a mi novia mañana, algo romántico, tenemos $80.000 entre los dos y no quiero manejar mucho',
      {
        budget: 80000,
        sources: {
          budget: 'text',
          partySize: null,
          duration: null,
          location: 'default',
        },
      },
    );
    expect(intent.occasion).toBe('romantic');
    expect(intent.party).toEqual({ size: 2, composition: 'couple' });
    expect(intent.when.date).toBe('2026-10-17');
    expect(intent.budget).toEqual({ amount: 80000, strict: true });
    expect(intent.location.travelTolerance).toBe('low');
    expect(intent.provenance.travel).toBe('text');
    expect(intent.experiences.map(({ key }) => key)).toEqual(['dinner']);
    expect(intent.vibe).toContain('romantic');
  });

  it.each([
    'sin movernos mucho',
    'no nos queremos mover mucho',
    'no queremos movernos mucho',
    'no queremos manejar mucho',
  ])('preserves low travel from the group phrase "%s"', (phrase) => {
    const intent = intentFor(`Cena mañana para dos personas ${phrase}`);
    expect(intent.location.travelTolerance).toBe('low');
    expect(intent.provenance.travel).toBe('text');
  });

  it('tells "mañana" (tomorrow) from "a la mañana" (the morning)', () => {
    expect(intentFor('algo para hacer mañana').when.date).toBe('2026-10-17');
    expect(intentFor('algo para hacer a la mañana').when.date).toBe(
      '2026-10-16',
    );
  });

  it('gives different intents different shapes, not one "Gastronomy" category', () => {
    const keys = (query: string) =>
      intentFor(query).experiences.map(({ key }) => key);
    expect(keys('cena romántica')).toEqual(['dinner']);
    expect(keys('brunch')).toEqual(['brunch']);
    expect(keys('merienda')).toEqual(['merienda']);
    expect(keys('cerveza con amigos')).toEqual(['beer']);
    expect(keys('primera cita')).toEqual(['drinks']);
    expect(intentFor('salir a comer con amigos').occasion).toBe('friends');
    expect(intentFor('comer barato').pricePreference).toBe('cheap');
    expect(intentFor('algo premium').pricePreference).toBe('premium');
  });

  it('reads constraints: free, indoor, kids', () => {
    expect(intentFor('algo gratis al aire libre').constraints.freeOnly).toBe(
      true,
    );
    expect(intentFor('algo gratis al aire libre').experiences[0].key).toBe(
      'walk',
    );
    expect(intentFor('algo para hacer si llueve').constraints.indoorOnly).toBe(
      true,
    );
    expect(
      intentFor('plan familiar con los nenes').constraints.kidFriendly,
    ).toBe(true);
  });

  it('treats outdoor as a preference, not an extra required activity', () => {
    const intent = intentFor('una cita hoy a la noche, birra y aire libre');
    expect(intent.experiences.map(({ key }) => key)).toEqual(['beer']);
    expect(intent.vibe).toContain('outdoor');
    expect(intent.occasion).toBe('romantic');
    expect(intent.party).toEqual({ size: 2, composition: 'couple' });
  });

  it('starts "ahora" at the next quarter hour and keeps an explicit clock time', () => {
    expect(intentFor('qué hacemos ahora').when).toMatchObject({
      now: true,
      startMinutes: 15 * 60 + 15,
    });
    expect(intentFor('cena a las 21:30').when.startMinutes).toBe(21 * 60 + 30);
    expect(intentFor('cenar a las 9 de la noche').when.startMinutes).toBe(
      21 * 60,
    );
  });

  it('treats a profile budget as a habit, not a ceiling', () => {
    const intent = intentFor('salir', {
      budget: 30000,
      sources: {
        budget: 'profile',
        partySize: null,
        duration: null,
        location: 'profile',
      },
    });
    expect(intent.budget).toEqual({ amount: 30000, strict: false });
    expect(intent.provenance.budget).toBe('profile');
  });

  it('keeps the order the person said ("cena y después un helado")', () => {
    expect(
      intentFor('cena romántica y después un helado').experiences.map(
        ({ key }) => key,
      ),
    ).toEqual(['dinner', 'dessert']);
    expect(intentFor('cine y cena').experiences.map(({ key }) => key)).toEqual([
      'movie',
      'dinner',
    ]);
  });

  it('plans an unsequenced dinner and cinema around the real showtime', () => {
    const keys = (query: string) =>
      intentFor(query).experiences.map(({ key }) => key);
    expect(keys('cena + cine')).toEqual(['movie', 'dinner']);
    expect(keys('cena y después cine')).toEqual(['dinner', 'movie']);
    expect(keys('cine después de cenar')).toEqual(['dinner', 'movie']);
  });

  it('names Valle de Uco as a region and expects travel there', () => {
    const intent = intentFor('bodega y almuerzo en Valle de Uco');
    expect(intent.location.region).toBe('valle_de_uco');
    expect(intent.location.travelTolerance).toBe('high');
  });

  it('understands Mendoza as the full local catalog area', () => {
    const intent = intentFor(
      'Tengo ganas de salir esta noche, ¿qué hay para hacer por Mendoza?',
    );
    expect(intent.location.region).toBe('mendoza');
  });
});

describe('scheduleIntent', () => {
  it('schedules an implicit evening dinner inside its own meal window', () => {
    const at = new Date('2026-10-16T19:07:00-03:00');
    const scheduled = scheduleIntent(
      intentFor('algo barato en Godoy Cruz'),
      at,
    );
    const shape = buildPlanShape(scheduled, at);
    expect(scheduled.when.date).toBe('2026-10-16');
    expect(scheduled.when.startMinutes).toBe(21 * 60);
    expect(
      shape.slots.find((slot) => slot.role === 'ANCHOR')?.experiences,
    ).toEqual(['dinner']);
    expect(shape.anchorPreferredStart).toBe(21 * 60);
  });

  it('preserves an explicit time across an implicit activity boundary', () => {
    const intent = intentFor('algo barato a las 19:45');
    expect(scheduleIntent(intent, FRIDAY_AFTERNOON)).toBe(intent);
  });

  it('moves a brunch asked at 15:00 to tomorrow', () => {
    const intent = scheduleIntent(intentFor('brunch'), FRIDAY_AFTERNOON);
    expect(intent.when.date).toBe('2026-10-17');
  });

  it('keeps a dinner asked at 15:00 for tonight', () => {
    expect(scheduleIntent(intentFor('cena'), FRIDAY_AFTERNOON).when.date).toBe(
      '2026-10-16',
    );
  });

  it('moves a winery + lunch to tomorrow when lunch can no longer fit today', () => {
    const intent = scheduleIntent(
      intentFor('bodega y almuerzo'),
      FRIDAY_AFTERNOON,
    );
    expect(intent.when.date).toBe('2026-10-17');
  });

  it('never moves a day the person said', () => {
    const intent = scheduleIntent(intentFor('brunch hoy'), FRIDAY_AFTERNOON);
    expect(intent.when.date).toBe('2026-10-16');
  });
});
