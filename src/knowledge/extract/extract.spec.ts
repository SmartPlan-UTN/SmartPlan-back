import { extractBusinessFacts, weekFromSpecification } from './business-facts';
import { extractMenu } from './menu-text';
import { readPage } from './page';

const AT = new Date('2026-10-17T12:00:00-03:00');

describe('readPage + extractBusinessFacts', () => {
  it('reads a nested product-card price once and keeps explicit ARS decimals', () => {
    const page = readPage(
      'https://venue.example/products',
      `<div class="products">
      <a class="product-card"><h3 class="product-card__title">Pizza grande</h3>
        <div class="product-card__description">Salsa, queso y tomate</div>
        <div class="product-card__price"><div class="product__prices"><span class="product__price">$ 29.000,00</span></div></div>
      </a>
      <a class="product-card"><h3>Promo ambigua</h3><div class="product-card__price">$ 20.000,00 $ 25.000,00</div></a>
    </div>`,
    );
    expect(page.menuLines).toEqual(['Pizza grande $ 29.000,00']);
    expect(extractMenu(page.menuLines!, ['dinner']).items).toMatchObject([
      { name: 'Pizza grande', role: 'main', amount: 29000, serves: 1 },
    ]);
  });

  it('preserves explicit product variants and refuses ambiguous price grids', () => {
    const page = readPage(
      'https://venue.example/carta',
      `<section id="burgers"><h2>BUR GERS</h2>
      <article class="product-card"><h3>Clásica</h3>
        <span class="price-grid-col-label">Simple</span><span class="price-grid-col-label">Doble</span>
        <span class="price-val">$ 11.900</span><span class="price-val">$ 14.500</span>
      </article>
      <article class="product-card"><h3>Ambigua</h3><span class="price-val">$ 12.900</span><span class="price-val">$ 17.500</span></article>
      <article class="product-card"><h3>Sin precio</h3><span class="price-val">Consultar</span></article>
    </section>`,
    );
    expect(page.menuLines).toContain('Clásica Simple $ 11.900');
    expect(page.menuLines).toContain('Clásica Doble $ 14.500');
    expect(page.menuLines?.some((line) => line.includes('Ambigua'))).toBe(
      false,
    );
    expect(page.menuLines?.some((line) => line.includes('Sin precio'))).toBe(
      false,
    );
    expect(extractMenu(page.menuLines!, ['dinner']).items).toMatchObject([
      { name: 'Clásica Simple', role: 'main', amount: 11900 },
      { name: 'Clásica Doble', role: 'main', amount: 14500 },
    ]);
  });

  it('reads Schema.org hours, price range and menu links', () => {
    const html = `<html><head><title>Bistró X</title>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Restaurant',
            name: 'Bistró X',
            telephone: '+54 261 555-1234',
            priceRange: '$$$',
            servesCuisine: ['Cocina de autor'],
            address: {
              streetAddress: 'Belgrano 1200',
              addressLocality: 'Mendoza',
            },
            openingHoursSpecification: [
              {
                dayOfWeek: ['Tuesday', 'Wednesday'],
                opens: '20:00',
                closes: '00:30',
              },
              {
                dayOfWeek: 'https://schema.org/Saturday',
                opens: '12:00',
                closes: '16:00',
              },
            ],
            hasMenu: 'https://bistrox.com/carta',
          },
        ],
      })}</script></head><body><a href="/reservas">Reservar</a></body></html>`;
    const facts = extractBusinessFacts(
      readPage('https://bistrox.com/', html),
      AT,
    );
    expect(facts.names).toEqual(['Bistró X']);
    expect(facts.hours?.method).toBe('SCHEMA_ORG');
    expect(facts.hours?.week[2]).toEqual([[1200, 1470]]);
    expect(facts.hours?.week[1]).toBe('closed');
    expect(facts.priceRange).toBe('$$$');
    expect(facts.menuLinks[0].href).toBe('https://bistrox.com/carta');
    expect(facts.addresses).toEqual(['Belgrano 1200, Mendoza']);
  });

  it('reads labelled hours text but not a lunch-menu service', () => {
    const html = `<body>
      <h3>Menú ejecutivo</h3><p>Lunes a viernes de 12 a 15</p>
      <h3>Horarios</h3><p>Martes a domingo de 20 a 00</p><p>Lunes cerrado</p>
      </body>`;
    const facts = extractBusinessFacts(readPage('https://x.ar/', html), AT);
    expect(facts.hours?.method).toBe('OFFICIAL_TEXT');
    expect(facts.hours?.week[3]).toEqual([[1200, 1440]]);
    expect(facts.hours?.week[1]).toBe('closed');
  });

  it('ignores expired seasonal specifications', () => {
    expect(
      weekFromSpecification(
        [
          {
            dayOfWeek: 'Monday',
            opens: '10:00',
            closes: '12:00',
            validThrough: '2025-01-01',
          },
        ],
        AT,
      ),
    ).toBeNull();
  });
});

describe('extractMenu', () => {
  const lines = [
    'Entradas',
    'Provoleta ........ $9.800',
    'Empanadas (2) $5.600',
    'Principales',
    'Ojo de bife con papas $24.500',
    'Risotto de hongos $19.900',
    'Sorrentinos de calabaza $16.800',
    'Guarnición extra $4.000',
    'Bebidas',
    'Agua sin gas $3.200',
    'Copa de Malbec $6.500',
    'Botella Malbec reserva $32.000',
    'Postres',
    'Flan casero $6.900',
    'Volcán de chocolate $8.400',
  ];

  it('maps sections to roles, keeps portions and skips extras', () => {
    const menu = extractMenu(lines, ['lunch', 'dinner']);
    expect(menu.rejection).toBeNull();
    const byName = Object.fromEntries(menu.items.map((i) => [i.name, i]));
    expect(byName['Provoleta'].role).toBe('starter');
    expect(byName['Ojo de bife con papas'].role).toBe('main');
    expect(byName['Botella Malbec reserva'].serves).toBe(2);
    expect(byName['Flan casero'].role).toBe('dessert');
    expect(byName['Guarnición extra']).toBeUndefined();
    expect(byName['Ojo de bife con papas'].moments).toEqual([
      'lunch',
      'dinner',
    ]);
  });

  it('refuses a priced list it cannot structure', () => {
    expect(
      extractMenu(['Promo 1 $5.000', 'Promo 2 $6.000'], ['dinner']).rejection,
    ).toBe('too_few_items');
  });
});
