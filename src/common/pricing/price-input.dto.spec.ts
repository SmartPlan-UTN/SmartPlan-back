import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InvalidPriceError } from './price';
import { PriceInputDto, priceInputFromDto } from './price-input.dto';

const NOW = new Date('2026-10-10T12:00:00Z');

function dto(overrides: Record<string, unknown>): PriceInputDto {
  return plainToInstance(PriceInputDto, {
    kind: 'FIXED',
    min: 1000,
    unit: 'PER_PERSON',
    source: 'CURATED',
    ...overrides,
  });
}

describe('PriceInputDto', () => {
  it('accepts a complete admin price', () => {
    expect(validateSync(dto({}))).toEqual([]);
  });

  it('only lets an administrator assert OFFICIAL or CURATED sources', () => {
    expect(validateSync(dto({ source: 'LEGACY' }))).not.toEqual([]);
    expect(validateSync(dto({ source: 'USER_REPORTED' }))).not.toEqual([]);
    expect(validateSync(dto({ source: 'OFFICIAL' }))).toEqual([]);
  });

  it('only accepts http(s) source references', () => {
    expect(validateSync(dto({ sourceRef: 'javascript:alert(1)' }))).not.toEqual(
      [],
    );
    expect(validateSync(dto({ sourceRef: 'https://example.test/t' }))).toEqual(
      [],
    );
  });

  it('rejects a verification date in the future', () => {
    expect(() =>
      priceInputFromDto(dto({ verifiedAt: '2027-01-01T00:00:00Z' }), NOW),
    ).toThrow(InvalidPriceError);
    expect(
      priceInputFromDto(dto({ verifiedAt: '2026-10-09T00:00:00Z' }), NOW)
        .priceVerifiedAt,
    ).toEqual(new Date('2026-10-09T00:00:00Z'));
  });

  it('stamps "now" when no verification date is given', () => {
    expect(priceInputFromDto(dto({}), NOW).priceVerifiedAt).toEqual(NOW);
  });
});
