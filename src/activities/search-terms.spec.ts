import { normalizeSearchText, parseSearch, wordPattern } from './search-terms';

describe('normalizeSearchText', () => {
  it('ignores case and accents', () => {
    expect(normalizeSearchText('  GASTRONOMÍA  y Cultura ')).toBe(
      'gastronomia y cultura',
    );
    expect(normalizeSearchText('Luján de Cuyo')).toBe('lujan de cuyo');
  });
});

describe('parseSearch', () => {
  it('drops filler words and keeps content words as AND groups', () => {
    const parsed = parseSearch('un día de bodegas en la ciudad');
    expect(parsed.groups.map((g) => g.terms[0])).toEqual(['bodegas', 'ciudad']);
  });

  it('keeps multi-word places together', () => {
    const parsed = parseSearch('Bodegas en Luján de Cuyo');
    expect(parsed.groups.map((g) => g.terms[0])).toEqual([
      'lujan de cuyo',
      'bodegas',
    ]);
  });

  it('expands obvious synonyms so naming does not hide an activity', () => {
    const rafting = parseSearch('rafting').groups[0].terms;
    expect(rafting).toContain('rafting');
    const trekking = parseSearch('trekking').groups[0].terms;
    expect(trekking).toEqual(
      expect.arrayContaining(['senderismo', 'caminata']),
    );
    const uco = parseSearch('valle de uco').groups[0].terms;
    expect(uco).toEqual(expect.arrayContaining(['tupungato', 'tunuyan']));
  });

  it('reads a game night as every game, not as nightlife', () => {
    const parsed = parseSearch('Noche de juegos');
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0]).toMatchObject({
      terms: ['noche de juegos'],
      activityTypes: ['game'],
    });
  });

  it('treats "gratis" as an intent that also matches positively FREE prices', () => {
    const group = parseSearch('gratis').groups[0];
    expect(group.matchesFreePrice).toBe(true);
    expect(parseSearch('bodega').groups[0].matchesFreePrice).toBe(false);
  });

  it('never loses a query made only of filler words', () => {
    expect(parseSearch('en la').groups).toHaveLength(1);
  });
});

describe('wordPattern', () => {
  it('matches whole words with an optional plural, never substrings', () => {
    const regex = new RegExp(
      wordPattern('spa').replace(/\\m/g, '\\b').replace(/\\M/g, '\\b'),
    );
    expect(regex.test('termas y spa en la montana')).toBe(true);
    expect(regex.test('plaza espana')).toBe(false);
    expect(
      new RegExp(
        wordPattern('bodega').replace(/\\m/g, '\\b').replace(/\\M/g, '\\b'),
      ).test('las bodegas'),
    ).toBe(true);
  });

  it('strips anything that is not a plain word character', () => {
    expect(wordPattern('a.*b')).not.toContain('.*');
  });
});

describe('parseSearch: intents that are not text', () => {
  it('finds explicitly documented experiences for two without matching every winery', () => {
    const [group] = parseSearch('pareja').groups;
    expect(group.terms).toContain('dos personas');
    expect(group.terms).not.toContain('bodega');
  });
  it('treats "barato" as a price condition, not a word to find', () => {
    const parsed = parseSearch('algo barato');
    expect(parsed.groups).toEqual([
      { terms: [], matchesFreePrice: true, cheapPrice: true },
    ]);
  });

  it('never expands "niños" to "familia" (a common winery name)', () => {
    const [group] = parseSearch('niños').groups;
    expect(group.terms).not.toContain('familia');
    expect(group.terms).toContain('chicos');
  });

  it('understands everyday words for food and nightlife', () => {
    expect(parseSearch('merienda').groups[0].terms).toContain('cafe');
    expect(parseSearch('hamburguesa').groups[0].terms).toContain('burger');
    expect(parseSearch('boliche').groups[0].terms).toContain('bailar');
  });
});
