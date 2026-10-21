import {
  ACTIVITY_SUBTYPES,
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
});
