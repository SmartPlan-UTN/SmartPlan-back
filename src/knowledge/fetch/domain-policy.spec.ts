import { domainPolicy } from './domain-policy';

describe('domainPolicy', () => {
  it('treats public OlaClick venue pages as menu platform sources', () => {
    expect(domainPolicy('wengan.ola.click')).toMatchObject({
      decision: 'allow',
      platform: 'MENU_PLATFORM',
    });
  });

  it('continues to reject social and marketplace sources', () => {
    expect(domainPolicy('instagram.com').decision).toBe('deny');
    expect(domainPolicy('pedidosya.com.ar').decision).toBe('deny');
  });
});
