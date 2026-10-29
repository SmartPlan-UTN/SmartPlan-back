#!/usr/bin/env node
// Builds the Hogar v1 package (schema v2): the single virtual place "En casa /
// donde estén" and the games and free plans that hang from it (#210, #135).
// Offline and deterministic. Descriptions are SmartPlan's own short rules;
// rulesRef points to a public reference of the game, never copied text.
//
//   node catalog-data/hogar-v1/build.cjs
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const VERIFIED_AT = '2026-10-28T00:00:00.000Z';
const ES = (page) => `https://es.wikipedia.org/wiki/${page}`;
const EN = (page) => `https://en.wikipedia.org/wiki/${page}`;

/**
 * [slug, name, description, minutes, type, occasions, minPeople, maxPeople,
 *  minAge, materials, rulesRef, free]
 * `free` is true only when nothing beyond what a home already has is needed
 * (phones, paper, a deck, dice). Anything that needs buying food, a
 * subscription or supplies stays UNKNOWN: never free without evidence.
 */
const ACTIVITIES = [
  // ---- H1: phones and social deduction -----------------------------------
  ['el-impostor', 'El impostor', 'Todos reciben la misma palabra secreta menos uno, el impostor, que no la sabe. Por turnos cada uno dice una palabra relacionada sin regalarla; al final se vota quién es el impostor. Si lo descubren gana el grupo; si no, gana él. Se reparte con los celulares o con papelitos.', 30, 'game', ['friends', 'family', 'big_group', 'party'], 4, 15, 10, ['solo celulares'], ES('Mafia_(juego)'), true],
  ['el-impostor-en-familia', 'El impostor en familia', 'Versión con palabras simples (animales, comidas, lugares de la casa) para jugar con chicos: el impostor tiene que adivinar la palabra antes de que lo descubran. Rondas cortas para que todos pasen por el rol.', 25, 'game', ['family', 'kids', 'quiet'], 4, 10, 7, ['papel y lápiz'], ES('Mafia_(juego)'), true],
  ['mafia-o-lobo', 'Mafia (o lobo)', 'Un narrador reparte roles en secreto: mafiosos, ciudadanos, un médico y un detective. De noche los mafiosos eligen a quién eliminar; de día todos debaten y votan a quién expulsar. Gana el bando que sobrevive.', 45, 'game', ['friends', 'big_group', 'party'], 6, 20, 12, ['papelitos o celulares'], ES('Mafia_(juego)'), true],
  ['quien-soy', '¿Quién soy?', 'Cada uno tiene un personaje en la frente (un papel pegado o la pantalla del celular) que no ve. Por turnos hace preguntas de sí o no para adivinarlo. Gana quien lo descubre con menos preguntas.', 30, 'game', ['friends', 'family', 'kids', 'party'], 3, 12, 7, ['papel, lápiz y cinta'], EN('Heads_Up!'), true],
  ['veinte-preguntas', 'Veinte preguntas', 'Uno piensa algo (un objeto, un animal, una persona famosa) y el resto tiene hasta veinte preguntas de sí o no para adivinarlo. Ideal para la mesa después de comer o para un viaje.', 20, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 10, 6, ['nada'], EN('Twenty_questions'), true],
  ['palabra-prohibida', 'Palabra prohibida', 'En equipos: hay que hacer adivinar una palabra a tu equipo sin decir las palabras prohibidas que la acompañan. Un minuto por turno con el cronómetro del celular; cada acierto suma un punto.', 40, 'game', ['friends', 'big_group', 'party'], 4, 16, 10, ['papelitos y un cronómetro'], EN('Taboo_(game)'), true],
  ['trivia-por-equipos', 'Trivia por equipos', 'Preguntas de cultura general por rondas temáticas (deportes, música, Mendoza, cine). Un presentador lee, los equipos anotan en papel y se corrige al final de cada ronda.', 60, 'game', ['friends', 'family', 'big_group', 'quiet'], 4, 20, 10, ['papel, lápiz y un celular para las preguntas'], ES('Trivia'), true],
  ['telefono-descompuesto', 'Teléfono descompuesto', 'En ronda, el primero dice una frase al oído del siguiente y así hasta el último, que la dice en voz alta. Se ríen de cuánto cambió en el camino.', 15, 'game', ['family', 'kids', 'big_group', 'party'], 6, 20, 4, ['nada'], ES('Tel%C3%A9fono_descompuesto'), true],
  ['piedra-papel-o-tijera-torneo', 'Torneo de piedra, papel o tijera', 'Llaves eliminatorias al mejor de tres hasta coronar al campeón de la casa. Sirve para decidir quién elige la película o quién lava los platos.', 15, 'game', ['family', 'kids', 'friends', 'party'], 2, 16, 4, ['nada'], ES('Piedra,_papel_o_tijera'), true],
  // ---- H2: paper, pencil and words ----------------------------------------
  ['tutti-frutti', 'Tutti frutti (basta)', 'Se elige una letra al azar y cada uno completa categorías (nombre, país, animal, color, comida, cosa) con palabras que empiecen con esa letra. El primero que termina grita «¡basta!» y se cuentan puntos: más si nadie más usó tu palabra.', 30, 'game', ['family', 'friends', 'kids', 'quiet'], 2, 10, 8, ['papel y lápiz'], ES('Stop_(juego)'), true],
  ['ahorcado', 'Ahorcado', 'Uno piensa una palabra y dibuja una raya por letra. Los demás proponen letras; cada error suma una parte al dibujo del ahorcado. Ganan si adivinan la palabra antes de completarlo.', 15, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 6, 6, ['papel y lápiz'], ES('Ahorcado_(juego)'), true],
  ['charadas-con-mimica', 'Dígalo con mímica', 'En dos equipos, cada jugador saca un papelito con una película, canción o libro y lo hace adivinar a su equipo sin hablar, solo con gestos. Se juega contra reloj y gana el equipo con más aciertos.', 45, 'game', ['friends', 'family', 'big_group', 'party'], 4, 20, 8, ['papelitos y un cronómetro'], ES('Charadas'), true],
  ['dibujo-adivinado', 'Dibujo adivinado', 'Por turnos, uno dibuja una palabra secreta en papel o en una pizarra y su equipo tiene un minuto para adivinarla. No vale escribir letras ni números.', 40, 'game', ['friends', 'family', 'kids', 'party'], 4, 16, 7, ['papel y marcadores'], ES('Pictionary'), true],
  ['batalla-naval', 'Batalla naval en papel', 'Cada uno dibuja su grilla y ubica sus barcos sin que el otro vea. Por turnos se «disparan» coordenadas (B4, F7) hasta hundir toda la flota del rival.', 30, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 2, 7, ['papel cuadriculado y lápiz'], ES('Batalla_naval_(juego)'), true],
  ['tateti', 'Ta-te-ti', 'En una grilla de tres por tres, cada jugador marca su símbolo por turnos; gana quien completa una línea. Ideal para chicos y para torneos rápidos.', 10, 'game', ['family', 'kids', 'quiet'], 2, 2, 4, ['papel y lápiz'], ES('Tres_en_l%C3%ADnea'), true],
  ['cadaver-exquisito', 'Cadáver exquisito', 'Se escribe una historia entre todos: cada uno agrega una frase viendo solo la última línea y dobla el papel. Al final se lee en voz alta el resultado, siempre absurdo.', 25, 'game', ['friends', 'romantic', 'family', 'quiet'], 3, 10, 8, ['papel y lápiz'], ES('Cad%C3%A1ver_exquisito'), true],
  ['puntos-y-cajas', 'Puntos y cajas', 'Sobre una grilla de puntos, cada jugador traza una línea por turno; quien cierra un cuadrado lo marca con su inicial y vuelve a jugar. Gana quien cierra más cuadrados.', 15, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 4, 6, ['papel y lápiz'], ES('Timbiriche'), true],
  ['sopa-de-letras-casera', 'Sopa de letras casera', 'Cada uno arma una sopa de letras con palabras de un tema y se la pasa a otro para resolverla. Gana quien encuentra todas primero.', 30, 'game', ['family', 'kids', 'solo', 'quiet'], 1, 6, 7, ['papel cuadriculado y lápiz'], ES('Sopa_de_letras'), true],
  // ---- H3: cards, dice and board games ------------------------------------
  ['truco', 'Truco', 'El clásico de cartas españolas en parejas: se juegan tres manos por ronda, con envido, truco y flor, y se anota hasta 30. Se miente, se hacen señas y se gana con picardía.', 60, 'game', ['friends', 'family', 'quiet'], 2, 6, 10, ['un mazo de cartas españolas'], ES('Truco_argentino'), true],
  ['chinchon', 'Chinchón', 'Con cartas españolas, cada uno intenta armar escaleras y grupos con sus siete cartas levantando y descartando por turno. Se cierra cuando queda poco por bajar y pierde quien pasa los 100 puntos.', 45, 'game', ['romantic', 'friends', 'family', 'quiet'], 2, 6, 10, ['un mazo de cartas españolas'], ES('Chinch%C3%B3n'), true],
  ['escoba-de-15', 'Escoba de 15', 'Con cartas españolas, se levantan de la mesa las cartas que con la tuya sumen 15. Se cuentan escobas, oros, sietes y la carta más alta. Se juega a 15 puntos.', 40, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 4, 8, ['un mazo de cartas españolas'], ES('Escoba_(juego_de_naipes)'), true],
  ['generala', 'Generala', 'Con cinco dados y tres tiros por turno, se buscan juegos como escalera, full, póker y generala, y se anotan en la planilla. Gana quien suma más puntos al completar todas las casillas.', 40, 'game', ['romantic', 'friends', 'family', 'kids', 'quiet'], 2, 8, 8, ['cinco dados, papel y lápiz'], ES('Generala'), true],
  ['ajedrez', 'Ajedrez', 'Una partida a la antigua, o con reloj de celular para hacerla rápida. Si uno recién empieza, el otro juega sin la dama para emparejar.', 45, 'game', ['romantic', 'family', 'solo', 'quiet'], 1, 2, 7, ['un tablero de ajedrez'], ES('Ajedrez'), true],
  ['damas', 'Damas', 'Cada jugador mueve sus fichas en diagonal y come saltando sobre las del rival; la que llega al fondo se corona. Gana quien se queda con fichas.', 30, 'game', ['family', 'kids', 'romantic', 'quiet'], 2, 2, 6, ['un tablero de damas o de ajedrez'], ES('Damas'), true],
  ['domino', 'Dominó', 'Se reparten las fichas y por turnos se encastran por el número que coincide. Quien se queda sin fichas primero gana la mano; se juega a 100 puntos.', 30, 'game', ['family', 'friends', 'kids', 'quiet'], 2, 4, 6, ['un juego de dominó'], ES('Domin%C3%B3'), true],
  ['rummy', 'Rummy con cartas', 'Con mazo francés: se arman juegos y escaleras levantando del pozo o del descarte; el primero que baja todas sus cartas gana la mano.', 45, 'game', ['friends', 'family', 'quiet'], 2, 6, 10, ['un mazo de cartas francesas'], ES('Rummy'), true],
  ['cucharas', 'Cucharas', 'Se juntan cuatro cartas iguales pasando una carta por vez en ronda. Al que lo logra, agarra una cuchara del centro y todos corren a agarrar una; el que se queda sin cuchara pierde una letra.', 20, 'game', ['friends', 'family', 'kids', 'party'], 3, 10, 8, ['un mazo y cucharas (una menos que jugadores)'], EN('Spoons_(card_game)'), true],
  ['bingo-casero', 'Bingo casero', 'Cada uno arma su cartón con números del 1 al 90 en papel y un «cantor» los saca al azar con el celular. Premios simbólicos: elegir la música, no lavar los platos.', 40, 'game', ['family', 'kids', 'big_group', 'quiet'], 3, 20, 5, ['papel, lápiz y un celular'], ES('Bingo'), true],
  ['loteria-de-figuras', 'Lotería de figuras', 'Versión con dibujos para los más chicos: cada cartón tiene figuras y el cantor las va nombrando. Gana quien llena primero su cartón.', 30, 'game', ['family', 'kids', 'quiet'], 3, 10, 4, ['cartones dibujados a mano'], ES('Loter%C3%ADa_(juego)'), true],
  ['noche-de-juegos-de-mesa', 'Noche de juegos de mesa', 'Cada uno trae o busca en casa el juego de mesa que tenga y se arma una ronda por mesa, rotando cada media hora. Lo que no tenga reglas a mano se juega con las del juego clásico.', 120, 'game', ['friends', 'family', 'big_group', 'quiet'], 3, 16, 8, ['los juegos de mesa que haya'], ES('Juego_de_mesa'), true],
  ['rompecabezas-en-equipo', 'Rompecabezas en equipo', 'Se arma entre todos el rompecabezas que haya en casa, empezando por los bordes. Con música y mate es un plan tranquilo de tarde de lluvia.', 90, 'game', ['family', 'romantic', 'solo', 'quiet', 'indoor'], 1, 6, 5, ['un rompecabezas'], ES('Rompecabezas'), true],
  ['sudoku-a-dos', 'Sudoku a contrarreloj', 'Cada uno resuelve el mismo sudoku impreso o en el celular; gana quien lo completa primero sin errores.', 30, 'game', ['romantic', 'solo', 'quiet'], 1, 4, 10, ['papel y lápiz o celular'], ES('Sudoku'), true],
  // ---- H4: creative plans at home -----------------------------------------
  ['karaoke-casero', 'Karaoke casero', 'Se busca la pista con letra en el celular o la tele y se canta por turnos o en dúo. Para animar: una ronda de clásicos del rock nacional y otra de cumbia.', 60, 'home_plan', ['friends', 'family', 'big_group', 'party'], 2, 15, 6, ['un celular o una tele con internet'], ES('Karaoke'), true],
  ['cine-en-casa-tematico', 'Cine en casa temático', 'Se elige un tema (películas de los 90, una saga, terror) y se arma la sala: luces bajas, almohadones y algo para picar. El precio depende de la plataforma y de lo que compren para comer.', 150, 'home_plan', ['romantic', 'friends', 'family', 'quiet', 'indoor'], 1, 8, null, ['una tele o proyector y una plataforma de películas'], ES('Cine_en_casa'), false],
  ['cocinar-juntos', 'Cocinar juntos', 'Se elige una receta (pizzas caseras, empanadas, pastas) y se reparte el trabajo. Después se come lo que salió. El costo es el de los ingredientes.', 120, 'home_plan', ['romantic', 'family', 'friends', 'kids', 'quiet'], 2, 8, null, ['ingredientes de la receta'], null, false],
  ['spa-casero', 'Spa casero', 'Música tranquila, mascarillas caseras, masajes por turnos y algo rico para tomar. Un plan de descanso en pareja o entre amigas. El costo depende de lo que compren.', 90, 'home_plan', ['romantic', 'friends', 'quiet', 'indoor'], 1, 4, 14, ['toallas, cremas o mascarillas'], null, false],
  ['picnic-en-el-living', 'Picnic en el living', 'Mantel en el piso, comida para picar y juegos de cartas. Para un día de lluvia o una noche distinta sin salir. El costo es el de la comida.', 90, 'home_plan', ['romantic', 'family', 'kids', 'quiet', 'indoor'], 2, 8, null, ['un mantel y algo para comer'], ES('Picnic'), false],
  ['noche-de-talentos', 'Noche de talentos', 'Cada uno prepara un número corto (cantar, un truco, un chiste, bailar) y lo presenta. Los demás votan con aplausos y se entrega un premio inventado.', 60, 'home_plan', ['family', 'friends', 'kids', 'party'], 3, 15, 5, ['nada'], null, true],
  ['papiroflexia', 'Tarde de origami', 'Con hojas cualquiera se aprenden figuras simples (barco, grulla, avión) siguiendo un video o un diagrama. Después se hace una competencia de aviones de papel.', 45, 'home_plan', ['family', 'kids', 'solo', 'quiet', 'indoor'], 1, 8, 6, ['hojas de papel'], ES('Papiroflexia'), true],
  ['lectura-en-voz-alta', 'Lectura en voz alta', 'Se elige un cuento o un capítulo de un libro y se lee por turnos, con voces para cada personaje. Al final cada uno cuenta qué le pareció.', 45, 'home_plan', ['family', 'kids', 'romantic', 'quiet', 'indoor'], 2, 8, 4, ['un libro'], ES('Club_de_lectura'), true],
  ['obra-de-titeres', 'Obra de títeres casera', 'Con medias, bolsas o papel se arman títeres y una mesa da vuelta hace de escenario. Los chicos inventan la historia y la presentan al resto.', 60, 'home_plan', ['family', 'kids', 'quiet', 'indoor'], 2, 10, 4, ['medias viejas, papel y marcadores'], ES('T%C3%ADtere'), true],
  ['teatro-de-sombras', 'Teatro de sombras', 'Con una sábana y una linterna se proyectan sombras de manos y figuras recortadas. Se arma una historia corta y se presenta con las luces apagadas.', 45, 'home_plan', ['family', 'kids', 'romantic', 'quiet', 'indoor'], 2, 10, 4, ['una sábana, una linterna y cartón'], ES('Teatro_de_sombras'), true],
  ['busqueda-del-tesoro-en-casa', 'Búsqueda del tesoro en casa', 'Alguien esconde un «tesoro» y deja pistas encadenadas en distintos lugares de la casa; cada pista lleva a la siguiente. Se puede jugar en equipos y con acertijos para los más grandes.', 45, 'game', ['family', 'kids', 'friends', 'indoor'], 2, 12, 5, ['papel y lápiz para las pistas'], EN('Treasure_hunt_(game)'), true],
  // ---- H5: party and challenges -------------------------------------------
  ['verdad-o-reto', 'Verdad o reto', 'Por turnos cada uno elige responder una pregunta con sinceridad o cumplir un reto. Sin retos peligrosos, sin alcohol y sin publicar nada de nadie: el que no quiere, pasa.', 40, 'game', ['friends', 'big_group', 'party'], 3, 12, 14, ['nada'], ES('Verdad_o_reto'), true],
  ['yo-nunca-nunca', 'Yo nunca nunca (sin alcohol)', 'Cada uno dice algo que nunca hizo; quien sí lo hizo baja un dedo. Pierde el primero que se queda sin dedos. En esta versión no se toma: se cuentan dedos.', 30, 'game', ['friends', 'big_group', 'party'], 3, 15, 14, ['nada'], EN('Never_have_I_ever'), true],
  ['sillas-musicales', 'Sillas musicales', 'Se ponen sillas en ronda, una menos que jugadores. Mientras suena la música todos caminan alrededor; cuando para, hay que sentarse. El que queda parado sale y se saca una silla.', 20, 'game', ['family', 'kids', 'big_group', 'party'], 4, 15, 4, ['sillas y música'], ES('Juego_de_las_sillas'), true],
  ['simon-dice', 'Simón dice', 'Un «Simón» da órdenes; solo se cumplen las que empiezan con «Simón dice». El que obedece una orden sin esa frase queda afuera.', 15, 'game', ['family', 'kids', 'party'], 3, 20, 3, ['nada'], ES('Sim%C3%B3n_dice'), true],
  ['papa-caliente', 'Papa caliente', 'Se pasa un objeto en ronda mientras suena música; cuando para, quien lo tiene queda afuera o cumple una prenda simple.', 15, 'game', ['family', 'kids', 'big_group', 'party'], 4, 20, 3, ['una pelota o un objeto blando y música'], ES('Papa_caliente'), true],
  ['estatuas-musicales', 'Estatuas musicales', 'Todos bailan mientras suena la música y se quedan quietos como estatuas cuando se corta. El que se mueve, sale. Gana el último en pie.', 15, 'game', ['family', 'kids', 'party'], 3, 20, 3, ['música'], EN('Statues_(game)'), true],
  ['coreografia-viral', 'Reto de coreografía viral', 'Se elige un baile de moda en redes y se aprende entre todos en el living; después se graba solo para el grupo. Nada se publica sin el permiso de todos y nunca a menores.', 40, 'home_plan', ['friends', 'family', 'party'], 2, 10, 10, ['un celular con música'], null, true],
  // ---- H6: outdoors (patio, plaza or park) --------------------------------
  ['escondidas', 'Escondidas', 'Uno cuenta con los ojos tapados mientras los demás se esconden; después los busca. El primero encontrado cuenta en la próxima ronda. Se juega en casa, en el patio o en una plaza.', 30, 'game', ['family', 'kids', 'friends', 'outdoor'], 3, 15, 4, ['nada'], ES('Escondidas'), true],
  ['mancha', 'Mancha', 'Uno «la tiene» y persigue a los demás; al tocar a alguien, se la pasa. Variantes: mancha congelada o mancha pelota. Al aire libre.', 20, 'game', ['family', 'kids', 'friends', 'outdoor'], 3, 20, 4, ['nada'], ES('Pilla_pilla'), true],
  ['rayuela', 'Rayuela', 'Se dibuja la rayuela con tiza o una rama, se tira una piedrita al casillero y se salta en un pie sin pisar la línea. Clásico de vereda o de plaza.', 25, 'game', ['family', 'kids', 'outdoor'], 1, 8, 4, ['una tiza y una piedrita'], ES('Rayuela_(juego)'), true],
  ['saltar-la-soga', 'Saltar la soga', 'Dos hacen girar la soga y los demás entran a saltar con canciones de ronda. Se puede jugar a ver quién aguanta más saltos.', 20, 'game', ['family', 'kids', 'friends', 'outdoor'], 3, 12, 5, ['una soga larga'], ES('Comba'), true],
  ['quemado', 'Quemado', 'Dos equipos se tiran la pelota; el que es tocado sin agarrarla pasa al «cementerio» detrás del rival y puede quemar desde ahí. Gana el equipo que queda con jugadores.', 30, 'game', ['family', 'kids', 'friends', 'big_group', 'outdoor', 'adventure'], 6, 20, 6, ['una pelota blanda'], ES('Bal%C3%B3n_prisionero'), true],
  ['bolitas', 'Bolitas', 'Con un hoyito en la tierra o un círculo marcado, se lanzan las bolitas por turno para embocarlas o sacar las del rival. Clásico de patio y plaza.', 20, 'game', ['family', 'kids', 'outdoor'], 2, 6, 5, ['bolitas'], ES('Canica'), true],
  ['carrera-de-embolsados', 'Carrera de embolsados', 'Cada uno se mete en una bolsa grande y salta hasta la meta. Se puede hacer por postas en equipos. Mejor en pasto.', 20, 'game', ['family', 'kids', 'big_group', 'party', 'outdoor'], 4, 20, 5, ['bolsas grandes de arpillera o tela'], ES('Carrera_de_sacos'), true],
  ['busqueda-del-tesoro-al-aire-libre', 'Búsqueda del tesoro al aire libre', 'Pistas escondidas en el patio, una plaza o un parque, con un mapa dibujado a mano. En equipos y con un límite de tiempo. Se cuida no salir del lugar acordado.', 60, 'game', ['family', 'kids', 'friends', 'outdoor', 'adventure'], 3, 20, 6, ['papel, lápiz y un pequeño premio'], EN('Scavenger_hunt'), true],
  ['frisbee-en-la-plaza', 'Frisbee en la plaza', 'Pases de disco volador en ronda o un partido simple por puntos llevando el disco hasta la zona del rival. Para una tarde de sol con mate.', 45, 'game', ['friends', 'family', 'romantic', 'outdoor'], 2, 14, 7, ['un disco volador'], EN('Frisbee'), true],
];

const occasionOk = (list) =>
  list.some((o) => ['romantic', 'friends', 'family', 'kids', 'solo', 'big_group'].includes(o)) &&
  list.some((o) => ['quiet', 'party', 'outdoor', 'indoor', 'adventure', 'special'].includes(o));

const place = {
  slug: 'hogar',
  name: 'En casa / donde estén',
  description:
    'Juegos y planes que se hacen en casa o donde esté el grupo: no tiene dirección ni ubicación propia.',
  address: 'Donde estén',
  country: null,
  city: null,
  department: null,
  latitude: null,
  longitude: null,
  kind: 'home',
  googlePlaceId: null,
  verifiedAt: null,
  sourceRef: null,
};

const slugs = new Set();
const activities = ACTIVITIES.map(
  ([slug, name, description, minutes, type, occasions, minPeople, maxPeople, minAge, materials, rulesRef, free]) => {
    if (slugs.has(slug)) throw new Error(`Duplicate slug ${slug}`);
    slugs.add(slug);
    if (!occasionOk(occasions)) throw new Error(`${slug} needs a who and a mood occasion`);
    if (free && !rulesRef && materials[0] !== 'nada' && !/celular|papel/.test(materials.join()))
      console.warn(`${slug}: free without a rules source`);
    const freePrice = free && rulesRef;
    return {
      slug: `hogar-${slug}`,
      name,
      description,
      durationMinutes: minutes,
      type,
      categories: ['Entertainment'],
      places: ['hogar'],
      price: freePrice
        ? { kind: 'FREE', min: 0, max: 0, unit: 'UNSPECIFIED', source: 'CURATED', sourceRef: rulesRef, verifiedAt: VERIFIED_AT }
        : { kind: 'UNKNOWN', min: null, max: null, unit: null, source: null, sourceRef: null, verifiedAt: null },
      verifiedAt: VERIFIED_AT,
      occasions: [...occasions].sort(),
      minPeople,
      ...(maxPeople != null ? { maxPeople } : {}),
      ...(minAge != null ? { minAge } : {}),
      materials: materials.filter((item) => item !== 'nada'),
      ...(rulesRef ? { rulesRef } : {}),
    };
  },
);

const sortedKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys(value[key])]));
  return value;
};

const pkg = {
  schemaVersion: 2,
  source: 'smartplan-hogar',
  licenseClass: 'OWNED',
  geography: [],
  places: [place],
  activities: activities.sort((a, b) => a.slug.localeCompare(b.slug)),
};
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'data/package.json'), `${JSON.stringify(sortedKeys(pkg), null, 2)}\n`);
const free = activities.filter((a) => a.price.kind === 'FREE').length;
console.log(`hogar-v1: ${activities.length} activities (${free} FREE with a rules source, ${activities.length - free} UNKNOWN)`);
