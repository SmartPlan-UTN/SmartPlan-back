import { menuCandidates, menuIndexHints } from './menu-discovery';
import { readPage } from './extract/page';
import { extractBusinessFacts } from './extract/business-facts';

const discover = (html: string, url = 'https://venue.example/') => {
  const page = readPage(url, html);
  return menuCandidates(page, extractBusinessFacts(page, new Date()));
};

describe('menu source discovery (CU49)', () => {
  it('resolves a publisher-shared Drive file to its ordinary public download without account access', () => {
    expect(
      discover(
        '<a href="https://drive.google.com/file/d/public-file-id/view?usp=sharing">Carta</a><a href="https://accounts.google.com/login">Menu</a>',
      ),
    ).toEqual([
      {
        href: 'https://drive.google.com/uc?export=download&id=public-file-id',
        text: 'Carta',
      },
    ]);
  });
  it('follows explicit menus on unknown providers and link hubs without schema metadata', () => {
    expect(
      discover(
        '<a href="https://new-provider.example/shop/123">Ver nuestra carta</a><a href="https://bio.site/venue">Links</a>',
      ),
    ).toEqual([
      {
        href: 'https://new-provider.example/shop/123',
        text: 'Ver nuestra carta',
      },
      { href: 'https://bio.site/venue', text: 'Links' },
    ]);
  });
  it('excludes blocked destinations, self links, languages, unrelated PDFs and branch changes', () => {
    expect(
      discover(
        '<a href="https://instagram.com/venue">Carta</a><a href="?branch=other">Menú</a><a href="?branch=mza">Carta</a><a href="/menu?lang=en">Menu</a><a href="/privacy.pdf">Menu privacy</a>',
        'https://venue.example/?branch=mza',
      ),
    ).toEqual([]);
  });
  it('deduplicates and caps navigation while prioritizing menus over intermediate pages', () => {
    const links = discover(
      '<a href="/cocina">Cocina</a>' +
        Array.from(
          { length: 20 },
          (_, i) =>
            `<a href="/menu/${i}">Carta</a><a href="/menu/${i}#x">Carta</a>`,
        ).join(''),
    );
    expect(links).toHaveLength(12);
    expect(links[0].href).toBe('https://venue.example/menu/0');
    expect(new Set(links.map((link) => link.href)).size).toBe(12);
  });
  it('keeps provider index matches as unverified hints for branch identity checks', () => {
    const page = readPage(
      'https://www.qrcarta.com/restaurant/mendoza',
      '<a href="/restaurant/mendoza/el-establo/4481/">EL ESTABLOMendozaAv. San Martín 2633Ver carta digital</a>',
    );
    const hints = menuIndexHints(
      [
        {
          id: 1,
          slug: 'establo',
          name: 'El Establo',
          latitude: null,
          longitude: null,
          departmentName: 'Mendoza',
        },
      ],
      page,
    );
    expect(hints).toHaveLength(1);
    expect(hints[0].via).toBe('REGISTRY');
  });
  it('does not follow links from a menu provider into other venues listings', () => {
    expect(
      discover(
        '<a href="/restaurant/potrerillos/gran-hotel-potrerillos/10206/">Gran Hotel</a>',
        'https://www.qrcarta.com/restaurant/mendoza/el-establo/4481/',
      ),
    ).toEqual([]);
  });
});
