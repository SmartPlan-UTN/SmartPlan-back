import { extractBusinessFacts, weekFromSpecification } from './business-facts';
import { extractMenu } from './menu-text';
import { readPage } from './page';

const AT = new Date('2026-10-17T12:00:00-03:00');

describe('readPage + extractBusinessFacts', () => {
  it('limits an executive lunch to its own publisher container and keeps explicit portions', () => {
    const page = readPage(
      'https://venue.example/carta',
      '<div class="vc_row"><h3>Menú Ejecutivo</h3><p>Almuerzo $15.000</p></div><div class="vc_row"><h2>Entradas</h2><p>Picada 2 personas $30.000</p><h2>Carnes</h2><p>Bife $37.000</p></div>',
    );
    expect(
      extractMenu(page.menuLines!, ['lunch', 'dinner']).items,
    ).toMatchObject([
      { name: 'Almuerzo', moments: ['lunch'] },
      { name: 'Bife', moments: ['lunch', 'dinner'] },
      { name: 'Picada 2 personas', serves: 2, moments: ['lunch', 'dinner'] },
    ]);
  });

  it('deduplicates repeated markup and refuses conflicting unlabelled prices and wine bottles', () => {
    const result = extractMenu(
      [
        'PRINCIPALES',
        'Bife $30.000',
        'Bife $30.000',
        'Pollo $20.000',
        'Pollo $25.000',
        'VINOS',
        'Malbec $40.000',
        'BEBIDAS',
        'Coca Cola $4.000',
      ],
      ['dinner'],
    );
    expect(result.items.map((item) => item.name)).toEqual([
      'Bife',
      'Coca Cola',
    ]);
  });
  it('applies an explicit shared section price only to sibling menu choices', () => {
    const page = readPage(
      'https://venue.example/carta',
      '<span><p><strong>PRINCIPALES – $37.000 –</strong></p><p>Milanesa napolitana<br>Risotto de hongos<br>Trucha con verduras</p></span><p>Unrelated footer</p>',
    );
    expect(extractMenu(page.menuLines!, ['dinner']).items).toMatchObject([
      { name: 'Milanesa napolitana', amount: 37000, role: 'main' },
      { name: 'Risotto de hongos', amount: 37000, role: 'main' },
      { name: 'Trucha con verduras', amount: 37000, role: 'main' },
    ]);
  });
  it('reads Voucheroo category cards without mixing the description or another product price', () => {
    const page = readPage(
      'https://menu.example/carta/',
      `<div class="category-section"><h2>ROLLS ESPECIALES</h2><div class="product-card"><div class="product-info"><div class="product-name">Nikkei x 10</div><div class="product-desc">Langostino, palta</div><div class="product-price">$25.500</div></div></div></div>`,
    );
    expect(extractMenu(page.menuLines!, ['dinner']).items).toMatchObject([
      { name: 'Nikkei x 10', role: 'main', amount: 25500, serves: 1 },
    ]);
  });

  it('keeps Carta Digital category filters attached to the matching menu products', () => {
    const page = readPage(
      'https://cartadigital.com.ar/mburgers',
      '<ul><li data-filter=".filter-32">Hamburguesas</li><li data-filter=".filter-41">Bebidas</li></ul><div class="menu-item filter-32"><div class="menu-content"><a>Baconator</a><span>$8900</span></div></div><div class="menu-item filter-41"><div class="menu-content"><a>Pepsi 500 ML</a><span>$2000</span></div></div>',
    );

    expect(extractMenu(page.menuLines!, ['dinner']).items).toMatchObject([
      { name: 'Baconator', amount: 8900, role: 'main' },
      { name: 'Pepsi 500 ML', amount: 2000, role: 'drink' },
    ]);
  });

  it('classifies named beer sizes from an online ordering menu as drinks', () => {
    expect(
      extractMenu(
        [
          'Pinta IPA del Amor $ 5.500,00',
          'Pinta Red Ale $ 5.200,00',
          'Pinta Honey $ 5.200,00',
          'Pinta Pomelo Rock $ 5.500,00',
          'Jarra Honey $ 11.700,00',
          'Mix cervecero $ 1.500,00',
        ],
        ['dinner'],
      ).items,
    ).toMatchObject([
      { name: 'Pinta IPA del Amor', role: 'drink', amount: 5500 },
      { name: 'Pinta Red Ale', role: 'drink', amount: 5200 },
      { name: 'Pinta Honey', role: 'drink', amount: 5200 },
      { name: 'Pinta Pomelo Rock', role: 'drink', amount: 5500 },
      { name: 'Jarra Honey', role: 'drink', amount: 11700 },
      { name: 'Mix cervecero', role: 'drink', amount: 1500 },
    ]);
  });

  it('discovers the public PDF behind a publisher embedded viewer', () => {
    const page = readPage(
      'https://venue.example/es/',
      '<iframe src="https://docs.google.com/gview?url=https%3A%2F%2Fvenue.example%2Fmenu.pdf&amp;embedded=true"></iframe>',
    );
    expect(page.links).toContainEqual({
      href: 'https://venue.example/menu.pdf',
      text: 'Embedded menu',
    });
  });

  it('reads explicit ARS schema offers and excludes another currency or ambiguous variants', () => {
    const page = readPage(
      'https://menu.example/',
      `<script type="application/ld+json">${JSON.stringify({
        '@type': 'MenuSection',
        name: 'PRINCIPALES',
        hasMenuItem: [
          {
            '@type': 'MenuItem',
            name: 'Milanesa',
            offers: { price: '15000', priceCurrency: 'ARS' },
          },
          {
            '@type': 'MenuItem',
            name: 'Foreign',
            offers: { price: '17000', priceCurrency: 'USD' },
          },
          {
            '@type': 'MenuItem',
            name: 'Ambiguous',
            offers: [
              { price: '16000', priceCurrency: 'ARS' },
              { price: '19000', priceCurrency: 'ARS' },
            ],
          },
        ],
      })}</script>`,
    );
    expect(extractMenu(page.menuLines!, ['dinner']).items).toMatchObject([
      { name: 'Milanesa', amount: 15000 },
    ]);
    expect(page.menuLines).toHaveLength(2);
  });
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
  it('keeps explicit wine glasses and refuses undocumented bottle portions or sweet-wine desserts', () => {
    const menu = extractMenu(
      [
        'CARTA DE VINOS',
        'A LA COPA',
        'Blanco Pinot Gris5 900',
        'Tinto Cabernet Sauvignon5 900',
        'Espumoso Extra Brut7 500',
        'RECOMENDACIÓN',
        'Vino Blanco y Rosado',
        'Sauvignon Blanc22 000',
        'VINOS DULCES',
        'Cosecha tardía19 000',
      ],
      ['dinner'],
    );
    expect(menu.items).toHaveLength(3);
    expect(
      menu.items.every(
        (item) =>
          item.role === 'drink' &&
          item.serves === 1 &&
          item.name.startsWith('Copa de vino · '),
      ),
    ).toBe(true);
    expect(menu.items.some((item) => item.amount >= 19000)).toBe(false);
    expect(menu.rejection).toBe('too_few_items');
  });

  it('reads attached space-grouped PDF prices without treating continuations as sections', () => {
    const menu = extractMenu(
      [
        'MENÚ',
        'Almuerzo ejecutivo23 000',
        'Menú especial (días hábiles)21 000',
        'Entrada + principal, o principal + postre del día',
        'Menú de temporada Tres Tiempos49 000',
        'Postre del día',
        'Jugo del día para 2 (mediodía)14 000',
        'ENTRADA',
        'Trucha y salmón ahumado (2 personas)30 000',
        'PRINCIPAL',
        'Musaka de cordero ahumado26 000',
        'Lomo de ternera ahumado, salsa36 000',
        'criolla, papas rústicas',
        'COMPLEMENTO',
        'Papa frita rústica12 000',
        'Menú Niño Tagliatelle speedy (-14 años)18 500',
        'BEBIDAS',
        'Agua mineral4 500',
        'Reservas 54 261 555 1234',
        'Abierto 19 a 01 h',
        'Año 2026',
      ],
      ['lunch', 'dinner'],
    );
    expect(menu.rejection).toBeNull();
    expect(menu.items).toEqual([
      {
        name: 'Almuerzo ejecutivo',
        role: 'main',
        amount: 23000,
        serves: 1,
        moments: ['lunch'],
      },
      {
        name: 'Menú de temporada Tres Tiempos',
        role: 'main',
        amount: 49000,
        serves: 1,
        moments: ['lunch', 'dinner'],
      },
      {
        name: 'Musaka de cordero ahumado',
        role: 'main',
        amount: 26000,
        serves: 1,
        moments: ['lunch', 'dinner'],
      },
      {
        name: 'Lomo de ternera ahumado, salsa',
        role: 'main',
        amount: 36000,
        serves: 1,
        moments: ['lunch', 'dinner'],
      },
      {
        name: 'Jugo del día para 2 (mediodía)',
        role: 'drink',
        amount: 14000,
        serves: 2,
        moments: ['lunch'],
      },
      {
        name: 'Agua mineral',
        role: 'drink',
        amount: 4500,
        serves: 1,
        moments: ['lunch', 'dinner'],
      },
      {
        name: 'Trucha y salmón ahumado (2 personas)',
        role: 'starter',
        amount: 30000,
        serves: 2,
        moments: ['lunch', 'dinner'],
      },
    ]);
  });

  it('keeps explicitly shared breakfast, brunch and afternoon service moments', () => {
    const menu = extractMenu(
      [
        'DESAYUNO · BRUNCH',
        'Desayuno y media tarde, brunch — de 8.00 a 12.00 y de 15.00 a 19.00',
        'Tostada con queso crema7 000',
        'Brunch de huevos24 800',
        'Tarde de tortas11 700',
      ],
      ['lunch', 'dinner'],
    );
    expect(
      menu.items.find((item) => item.name === 'Tostada con queso crema')
        ?.moments,
    ).toEqual(['breakfast', 'brunch', 'merienda']);
    expect(
      menu.items.find((item) => item.name === 'Brunch de huevos')?.moments,
    ).toEqual(['brunch']);
  });

  it('refuses unresolved PDF size prices and out-of-range grouped numbers', () => {
    const menu = extractMenu(
      [
        'BEBIDAS',
        'Jugo mediano / grande4 400 · 7 800',
        'Jugo pequeño $4.400 / grande $7.800',
        'Agua mineral4 500',
        'Reserva 4 000 000',
        'Dirección 1234 500',
      ],
      ['lunch'],
    );
    expect(menu.items).toEqual([
      {
        name: 'Agua mineral',
        role: 'drink',
        amount: 4500,
        serves: 1,
        moments: ['lunch'],
      },
    ]);
  });

  it('accepts a structured cafe menu without inventing dinner mains', () => {
    const menu = extractMenu(
      [
        'Cafetería',
        'Café espresso $3.500',
        'Café latte $4.500',
        'Cortado $3.800',
        'Pastelería',
        'Medialuna $2.500',
        'Torta de chocolate $6.500',
        'Alfajor $3.000',
      ],
      ['breakfast', 'merienda'],
    );
    expect(menu.rejection).toBeNull();
    expect(menu.items.filter((entry) => entry.role === 'drink')).toHaveLength(
      3,
    );
    expect(menu.items.filter((entry) => entry.role === 'dessert')).toHaveLength(
      3,
    );
    expect(menu.items.some((entry) => entry.role === 'main')).toBe(false);
    expect(menu.items.some((entry) => entry.moments.includes('brunch'))).toBe(
      false,
    );
  });
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
    expect(byName['Botella Malbec reserva'].serves).toBe(1);
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
