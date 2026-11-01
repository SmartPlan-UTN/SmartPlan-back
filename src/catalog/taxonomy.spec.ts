import {
  ACTIVITY_SUBTYPES,
  conflictingOccasions,
  isOccasion,
  OCCASIONS,
  occasionsInText,
  activitySubtypeSearchSql,
  categoriesOfPlaceKind,
  isActivitySubtype,
  isPlaceKind,
  PLACE_KINDS,
  placeKindsInCategories,
  toActivitySubtype,
  toPlaceKind,
} from './taxonomy';

describe('taxonomy', () => {
  it('keeps place kinds and activity subtypes as separate vocabularies', () => {
    expect(isPlaceKind('winery')).toBe(true);
    expect(isActivitySubtype('winery')).toBe(false);
    expect(isActivitySubtype('tasting')).toBe(true);
    expect(isPlaceKind('tasting')).toBe(false);
  });

  it('maps legacy free-text activity types to subtypes', () => {
    expect(toActivitySubtype('Visita a bodega')).toBe('winery_tour');
    expect(toActivitySubtype('Comida')).toBe('meal');
    expect(toActivitySubtype('Cabalgata')).toBe('horseback_riding');
    expect(toActivitySubtype('Excursión')).toBe('day_trip');
    expect(toActivitySubtype('tasting')).toBe('tasting');
    expect(toActivitySubtype('algo inventado')).toBeNull();
    expect(toActivitySubtype(null)).toBeNull();
  });

  it('maps legacy place kinds', () => {
    expect(toPlaceKind('Bodega')).toBe('winery');
    expect(toPlaceKind('museum')).toBe('museum');
    expect(toPlaceKind('???')).toBeNull();
  });

  it('files wineries and wine activities under Wine tourism, not only Gastronomy', () => {
    expect(categoriesOfPlaceKind('winery')).toEqual(['Wine tourism']);
    expect(ACTIVITY_SUBTYPES.tasting.categories).toContain('Wine tourism');
    expect(ACTIVITY_SUBTYPES.rafting.categories).toContain('Adventure');
  });

  it('finds every place kind of a category (for place items in Explore)', () => {
    const kinds = placeKindsInCategories(['Nightlife']);
    expect(kinds).toEqual(
      expect.arrayContaining(['bar', 'brewery', 'nightclub']),
    );
    expect(kinds).not.toContain('museum');
  });

  it('gives every entry a label, a category and searchable aliases', () => {
    for (const entry of [
      ...Object.values(PLACE_KINDS),
      ...Object.values(ACTIVITY_SUBTYPES),
    ]) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.categories.length).toBeGreaterThan(0);
      for (const alias of entry.aliases) {
        // Aliases are matched against folded text: lowercase, no accents.
        expect(alias).toMatch(/^[a-z0-9 ]+$/);
      }
    }
  });

  it('builds a search expression with the aliases of each subtype', () => {
    const sql = activitySubtypeSearchSql('"activity"."type"');
    expect(sql).toContain(`WHEN 'horseback_riding' THEN`);
    expect(sql).toContain('cabalgata');
    expect(sql).toContain('degustacion');
    expect(sql.endsWith(`ELSE '' END)`)).toBe(true);
  });

  describe('occasions', () => {
    it('is a separate vocabulary from kinds and subtypes', () => {
      for (const key of Object.keys(OCCASIONS)) {
        expect(isPlaceKind(key)).toBe(false);
        expect(isActivitySubtype(key)).toBe(false);
      }
      expect(isOccasion('romantic')).toBe(true);
      expect(isOccasion('cheap')).toBe(false);
    });

    it('gives every occasion a label, a group and folded aliases', () => {
      for (const entry of Object.values(OCCASIONS)) {
        expect(entry.label.length).toBeGreaterThan(0);
        expect(['who', 'mood']).toContain(entry.group);
        expect(entry.aliases.length).toBeGreaterThan(0);
        for (const alias of entry.aliases)
          expect(alias).toMatch(/^[a-z0-9 ]+$/);
      }
    });

    it('declares conflicts symmetrically and only between known occasions', () => {
      for (const [key, entry] of Object.entries(OCCASIONS)) {
        for (const other of entry.conflictsWith as readonly string[]) {
          expect(isOccasion(other)).toBe(true);
          expect(
            OCCASIONS[other as keyof typeof OCCASIONS]
              .conflictsWith as readonly string[],
          ).toContain(key);
        }
      }
    });

    it.each([
      ['un plan romántico con mi novia', ['romantic']],
      ['aniversario con mi esposa', ['romantic']],
      ['con los nenes un domingo de lluvia', ['family', 'kids', 'indoor']],
      ['plan en familia con chicos de 8 y 10 años', ['family', 'kids']],
      ['salir a bailar con amigas', ['friends', 'party']],
      ['cumpleaños con 15 amigos', ['friends', 'big_group']],
      ['algo para hacer solo un domingo', ['solo']],
      ['una cita tranquila para conversar', ['romantic', 'quiet']],
      ['tarde al aire libre con amigos y mate', ['friends', 'outdoor']],
      ['aventura en montaña', ['adventure']],
    ])('reads "%s" as %j', (text, expected) => {
      expect(occasionsInText(text)).toEqual(expected);
    });

    it('does not read occasions inside other words or from "solo" as "only"', () => {
      expect(occasionsInText('solo quiero comer sushi')).toEqual([]);
      expect(occasionsInText('recorrer bodegas en Luján')).toEqual([]);
      expect(occasionsInText('cumplir años')).toEqual([]);
    });

    it('lists the occasions that clash with a request', () => {
      expect(conflictingOccasions(['romantic'])).toEqual(['big_group']);
      expect(conflictingOccasions(['kids', 'quiet']).sort()).toEqual([
        'adventure',
        'party',
      ]);
      expect(conflictingOccasions(['quiet', 'party'])).toEqual([
        'adventure',
        'kids',
      ]);
    });
  });
});
