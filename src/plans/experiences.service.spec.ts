import { likeTerm } from './experiences.service';

describe('likeTerm', () => {
  it('wraps a plain search so it matches anywhere in the text', () => {
    expect(likeTerm('Mendoza')).toBe('%Mendoza%');
  });

  it('folds Spanish accents so a search works with or without them', () => {
    expect(likeTerm('café')).toBe('%cafe%');
    expect(likeTerm('CAFÉ')).toBe('%CAFE%');
    expect(likeTerm('Maipú')).toBe('%Maipu%');
  });

  it('turns the wildcards a person types into plain text', () => {
    expect(likeTerm('100%')).toBe('%100\\%%');
    expect(likeTerm('_')).toBe('%\\_%');
    expect(likeTerm('%%')).toBe('%\\%\\%%');
  });

  it('escapes the escape character itself', () => {
    expect(likeTerm('a\\b')).toBe('%a\\\\b%');
  });
});
