import { isHoursLabel, parseSpanishHours } from './hours-text';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

describe('parseSpanishHours', () => {
  it('reads ranges, split services and midnight crossing', () => {
    const parsed = parseSpanishHours(
      'Horarios: Martes a Sábado 12 a 16 y 20:30 a 00:30. Domingo 12 a 16 hs. Lunes cerrado',
    )!;
    expect(parsed.week[2]).toEqual([
      [h(12), h(16)],
      [h(20, 30), h(24, 30)],
    ]);
    expect(parsed.week[6]).toEqual(parsed.week[2]);
    expect(parsed.week[0]).toEqual([[h(12), h(16)]]);
    expect(parsed.week[1]).toBe('closed');
    expect(parsed.statedDays).toBe(7);
  });

  it('closes unnamed days only for a complete posted schedule', () => {
    const full = parseSpanishHours('Lunes a viernes de 9 a 13 y de 17 a 21')!;
    expect(full.week[1]).toEqual([
      [h(9), h(13)],
      [h(17), h(21)],
    ]);
    expect(full.week[6]).toBe('closed');
    expect(full.week[0]).toBe('closed');

    const partial = parseSpanishHours('Viernes y sábados 21 a 3')!;
    expect(partial.week[5]).toEqual([[h(21), h(27)]]);
    expect(partial.week[1]).toBeNull();
  });

  it('accepts abbreviations and "todos los días"', () => {
    expect(parseSpanishHours('Lun-Vie 8.30 - 20 hs')!.week[3]).toEqual([
      [h(8, 30), h(20)],
    ]);
    expect(parseSpanishHours('Todos los días de 19 a 2')!.week[0]).toEqual([
      [h(19), h(26)],
    ]);
  });

  it('never guesses an open-ended or absent close', () => {
    expect(parseSpanishHours('Martes a domingo desde las 20')).toBeNull();
    expect(parseSpanishHours('Te esperamos')).toBeNull();
  });
});

describe('isHoursLabel', () => {
  it('separates venue hours from a menu service', () => {
    expect(isHoursLabel('Horarios de atención')).toBe(true);
    expect(isHoursLabel('Estamos abiertos')).toBe(true);
    expect(isHoursLabel('Menú ejecutivo')).toBe(false);
    expect(isHoursLabel('Horario de delivery')).toBe(false);
  });
});
