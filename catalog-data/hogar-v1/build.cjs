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
 * (phones, paper, a deck of cards). Anything that needs buying a game, food,
 * a subscription or supplies stays UNKNOWN: never free without evidence.
 * Everything here happens inside a home: nothing needs a patio, a plaza or
 * going anywhere (#210).
 */
const ACTIVITIES = [
  // ---- H1: the group game night (phones, papelitos and talking) ------------
  ['el-impostor', 'El impostor', 'Ideal para una juntada de amigos. Todos reciben la misma palabra secreta menos uno, el impostor, que no la sabe. Por turnos cada uno dice una palabra relacionada sin regalarla; después se debate y se vota quién es el impostor. Si lo descubren gana el grupo; si no, gana él. La palabra se reparte con el celular (pasándolo en ronda) o con papelitos doblados.', 30, 'game', ['friends', 'family', 'big_group', 'party'], 4, 15, 10, ['un celular o papelitos'], ES('Mafia_(juego)'), true],
  ['mafia-o-lobo', 'Mafia (o lobo)', 'Para grupos grandes de amigos. Un narrador reparte roles en secreto con papelitos: mafiosos, ciudadanos, un médico y un detective. De «noche» todos cierran los ojos y los mafiosos eligen a quién eliminar; de «día» se debate y se vota a quién expulsar. Gana el bando que queda en pie.', 45, 'game', ['friends', 'big_group', 'party'], 6, 20, 12, ['papelitos'], ES('Mafia_(juego)'), true],
  ['adivina-el-personaje-sombrero', 'Adiviná el personaje (el sombrero)', 'Juego de grupos por equipos. Cada uno escribe cinco personajes famosos en papelitos y van todos a un bol. Tres rondas con los mismos papelitos, un minuto por turno: primero se describe libremente, después con una sola palabra y al final solo con mímica. Gana el equipo que adivina más.', 45, 'game', ['friends', 'big_group', 'party'], 4, 20, 10, ['papelitos, un bol y el cronómetro del celular'], EN('Celebrity_(game)'), true],
  ['quien-soy', '¿Quién soy?', 'Cada uno tiene un personaje pegado en la frente (un papelito con cinta) que no ve. Por turnos hace preguntas de sí o no al grupo para adivinarlo. Gana quien lo descubre con menos preguntas.', 30, 'game', ['friends', 'family', 'kids', 'party'], 3, 12, 7, ['papelitos y cinta'], EN('Heads_Up!'), true],
  ['charadas-con-mimica', 'Dígalo con mímica', 'En dos equipos de amigos: cada jugador saca un papelito con una película, canción o serie y la hace adivinar a su equipo sin hablar, solo con gestos (se marca la cantidad de palabras con los dedos). Un minuto por turno con el cronómetro del celular; gana el equipo con más aciertos.', 45, 'game', ['friends', 'family', 'big_group', 'party'], 4, 20, 8, ['papelitos y el cronómetro del celular'], ES('Charadas'), true],
  ['telefono-descompuesto-dibujado', 'Teléfono descompuesto con dibujos', 'Para grupos de amigos. Cada uno escribe una frase en la primera hoja de su pila y la pasa; el siguiente la dibuja y tapa la frase; el que sigue escribe qué cree que muestra el dibujo y tapa el dibujo, y así alternando hasta que la pila vuelve a su dueño. Al final se muestran todas y se ve cómo se deformó la frase.', 30, 'game', ['friends', 'big_group', 'party'], 4, 12, 8, ['una pila de hojas y un lápiz por jugador'], ES('Tel%C3%A9fono_descompuesto'), true],
  ['trivia-del-grupo', 'Trivia del grupo', '¿Cuánto se conocen? Cada uno escribe en papelitos tres preguntas sobre sí mismo o sobre anécdotas del grupo de amigos («¿a dónde fue mi primer viaje?»). Un presentador las lee, los demás anotan su respuesta y se suman puntos por acierto. Gana quien más sabe del grupo.', 40, 'game', ['friends', 'big_group', 'party'], 4, 15, 12, ['papelitos y lápices'], ES('Trivia'), true],
  ['quien-es-mas-probable', '¿Quién es más probable que…?', 'Uno lee una pregunta («¿quién es más probable que llegue tarde a su propio casamiento?») y a la cuenta de tres todos señalan a alguien del grupo. El más señalado cuenta por qué, si quiere. Rondas rápidas y muchas risas entre amigos.', 25, 'game', ['friends', 'big_group', 'party'], 4, 15, 14, ['una lista de preguntas en el celular'], EN('Party_game'), true],
  ['dos-verdades-y-una-mentira', 'Dos verdades y una mentira', 'Por turnos cada uno cuenta tres cosas sobre sí mismo: dos ciertas y una inventada. El grupo debate y vota cuál es la mentira; suma quien adivina y también quien engaña a la mayoría. Ideal para mezclar amigos que no se conocen tanto.', 25, 'game', ['friends', 'big_group', 'quiet'], 3, 15, 10, ['nada'], EN('Two_truths_and_a_lie'), true],
  ['palabra-prohibida', 'Palabra prohibida', 'En equipos de amigos: hay que hacer adivinar una palabra al propio equipo sin decir las cuatro palabras prohibidas anotadas debajo. Un minuto por turno; cada acierto suma un punto y decir una prohibida resta.', 40, 'game', ['friends', 'big_group', 'party'], 4, 16, 10, ['tarjetas de papel y el cronómetro del celular'], EN('Taboo_(game)'), true],
  ['adivina-la-cancion', 'Adiviná la canción', 'En equipos: uno pone cinco segundos de una canción con el celular (o la tararea) y su equipo tiene que decir el título o el artista. Rondas temáticas: rock nacional, cumbia, cuarteto, hits de los 2000. Suma el equipo que acierta primero.', 40, 'game', ['friends', 'family', 'big_group', 'party'], 4, 20, 8, ['un celular con música'], EN('Name_That_Tune'), true],
  ['espias-de-palabras', 'Espías de palabras', 'Se arman dos equipos y se ponen 25 palabras en papelitos en una grilla de 5 por 5. Cada equipo tiene un jefe que ve un mapa secreto (dibujado en papel) con las palabras de su equipo y da pistas de una palabra y un número («fruta, 2»). El equipo toca palabras; si toca la del asesino, pierde.', 45, 'game', ['friends', 'big_group', 'quiet'], 4, 12, 12, ['papelitos, papel y lápiz'], EN('Codenames_(board_game)'), true],
  ['dibujo-adivinado', 'Dibujo adivinado', 'Por turnos, uno dibuja una palabra secreta en papel y su equipo tiene un minuto para adivinarla. No vale escribir letras ni números. Funciona bien con amigos y con chicos.', 40, 'game', ['friends', 'family', 'kids', 'party'], 4, 16, 7, ['papel y marcadores'], ES('Pictionary'), true],
  ['veinte-preguntas', 'Veinte preguntas', 'Uno piensa algo (un objeto, un animal, una persona famosa) y el resto tiene hasta veinte preguntas de sí o no para adivinarlo. Ideal para la sobremesa.', 20, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 10, 6, ['nada'], EN('Twenty_questions'), true],
  ['trivia-por-equipos', 'Trivia por equipos', 'Preguntas de cultura general por rondas temáticas (deportes, música, Mendoza, cine). Un presentador las lee desde el celular, los equipos anotan en papel y se corrige al final de cada ronda.', 60, 'game', ['friends', 'family', 'big_group', 'quiet'], 4, 20, 10, ['papel, lápiz y un celular para las preguntas'], ES('Trivia'), true],
  ['el-impostor-en-familia', 'El impostor en familia', 'Versión con palabras simples (animales, comidas, cosas de la casa) para jugar con chicos: todos reciben la palabra menos el impostor, que tiene que adivinarla antes de que lo descubran. Rondas cortas para que todos pasen por el rol.', 25, 'game', ['family', 'kids', 'quiet'], 4, 10, 7, ['papelitos'], ES('Mafia_(juego)'), true],
  ['telefono-descompuesto', 'Teléfono descompuesto', 'En ronda, el primero dice una frase al oído del siguiente y así hasta el último, que la dice en voz alta. Se ríen de cuánto cambió en el camino.', 15, 'game', ['family', 'kids', 'big_group', 'party'], 6, 20, 4, ['nada'], ES('Tel%C3%A9fono_descompuesto'), true],
  // ---- H2: paper, pencil and words -------------------------------------------
  ['tutti-frutti', 'Tutti frutti (basta)', 'Se elige una letra al azar y cada uno completa categorías (nombre, país, animal, color, comida, cosa) con palabras que empiecen con esa letra. El primero que termina grita «¡basta!» y se cuentan puntos: más si nadie más usó tu palabra.', 30, 'game', ['family', 'friends', 'kids', 'quiet'], 2, 10, 8, ['papel y lápiz'], ES('Stop_(juego)'), true],
  ['cadaver-exquisito', 'Cadáver exquisito', 'Se escribe una historia entre todos: cada uno agrega una frase viendo solo la última línea y dobla el papel. Al final se lee en voz alta el resultado, siempre absurdo.', 25, 'game', ['friends', 'romantic', 'family', 'quiet'], 3, 10, 8, ['papel y lápiz'], ES('Cad%C3%A1ver_exquisito'), true],
  ['ahorcado', 'Ahorcado', 'Uno piensa una palabra y dibuja una raya por letra. Los demás proponen letras; cada error suma una parte al dibujo. Ganan si adivinan la palabra antes de completarlo.', 15, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 6, 6, ['papel y lápiz'], ES('Ahorcado_(juego)'), true],
  ['batalla-naval', 'Batalla naval en papel', 'Cada uno dibuja su grilla y ubica sus barcos sin que el otro vea. Por turnos se «disparan» coordenadas (B4, F7) hasta hundir toda la flota del rival.', 30, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 2, 7, ['papel cuadriculado y lápiz'], ES('Batalla_naval_(juego)'), true],
  ['tateti', 'Ta-te-ti', 'En una grilla de tres por tres, cada jugador marca su símbolo por turnos; gana quien completa una línea. Ideal para chicos y para torneos rápidos.', 10, 'game', ['family', 'kids', 'quiet'], 2, 2, 4, ['papel y lápiz'], ES('Tres_en_l%C3%ADnea'), true],
  ['puntos-y-cajas', 'Puntos y cajas', 'Sobre una grilla de puntos, cada jugador traza una línea por turno; quien cierra un cuadrado lo marca con su inicial y vuelve a jugar. Gana quien cierra más cuadrados.', 15, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 4, 6, ['papel y lápiz'], ES('Timbiriche'), true],
  ['sopa-de-letras-casera', 'Sopa de letras casera', 'Cada uno arma una sopa de letras con palabras de un tema y se la pasa a otro para resolverla. Gana quien encuentra todas primero.', 30, 'game', ['family', 'kids', 'solo', 'quiet'], 1, 6, 7, ['papel cuadriculado y lápiz'], ES('Sopa_de_letras'), true],
  ['sudoku-a-dos', 'Sudoku a contrarreloj', 'Cada uno resuelve el mismo sudoku impreso o en el celular; gana quien lo completa primero sin errores.', 30, 'game', ['romantic', 'solo', 'quiet'], 1, 4, 10, ['papel y lápiz o celular'], ES('Sudoku'), true],
  // ---- H3: cards and dice ------------------------------------------------------
  ['truco', 'Truco', 'El clásico de cartas españolas, de a dos, en parejas o de a seis: se juegan tres manos por ronda, con envido, truco y flor, y se anota hasta 30. Se miente, se hacen señas y se gana con picardía.', 60, 'game', ['friends', 'family', 'quiet'], 2, 6, 10, ['un mazo de cartas españolas'], ES('Truco_argentino'), true],
  ['mentiroso', 'Mentiroso', 'Con un mazo repartido entero, cada uno tira cartas boca abajo diciendo qué número son («dos cincos»), mintiendo si hace falta. Cualquiera puede gritar «¡mentiroso!»: si era mentira, el que tiró se lleva la pila; si era verdad, se la lleva el que acusó. Gana quien se queda sin cartas. Muy de juntada de amigos.', 30, 'game', ['friends', 'big_group', 'party'], 3, 10, 10, ['un mazo de cartas'], EN('Cheat_(game)'), true],
  ['cucharas', 'Cucharas', 'Se juntan cuatro cartas iguales pasando una carta por vez en ronda. Al que lo logra, agarra una cuchara del centro y todos corren a agarrar una; el que se queda sin cuchara pierde una letra. Rápido y ruidoso, ideal para grupos.', 20, 'game', ['friends', 'family', 'kids', 'party'], 3, 10, 8, ['un mazo y cucharas (una menos que jugadores)'], EN('Spoons_(card_game)'), true],
  ['chinchon', 'Chinchón', 'Con cartas españolas, cada uno intenta armar escaleras y grupos con sus siete cartas levantando y descartando por turno. Se cierra cuando queda poco por bajar y pierde quien pasa los 100 puntos.', 45, 'game', ['romantic', 'friends', 'family', 'quiet'], 2, 6, 10, ['un mazo de cartas españolas'], ES('Chinch%C3%B3n'), true],
  ['escoba-de-15', 'Escoba de 15', 'Con cartas españolas, se levantan de la mesa las cartas que con la tuya sumen 15. Se cuentan escobas, oros, sietes y la carta más alta. Se juega a 15 puntos.', 40, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 4, 8, ['un mazo de cartas españolas'], ES('Escoba_(juego_de_naipes)'), true],
  ['rummy', 'Rummy con cartas', 'Con mazo francés: se arman juegos y escaleras levantando del pozo o del descarte; el primero que baja todas sus cartas gana la mano.', 45, 'game', ['family', 'romantic', 'quiet'], 2, 6, 10, ['un mazo de cartas francesas'], ES('Rummy'), true],
  ['generala', 'Generala', 'Con cinco dados y tres tiros por turno, se buscan juegos como escalera, full, póker y generala, y se anotan en la planilla. Si no hay dados, sirve una app de dados del celular.', 40, 'game', ['romantic', 'family', 'kids', 'quiet'], 2, 8, 8, ['cinco dados o una app de dados, papel y lápiz'], ES('Generala'), true],
  ['bingo-casero', 'Bingo casero', 'Cada uno arma su cartón con números del 1 al 90 en papel y un «cantor» los saca al azar con el celular. Premios simbólicos: elegir la música, no lavar los platos.', 40, 'game', ['family', 'kids', 'big_group', 'quiet'], 3, 20, 5, ['papel, lápiz y un celular'], ES('Bingo'), true],
  ['loteria-de-figuras', 'Lotería de figuras', 'Versión con dibujos para los más chicos: cada cartón tiene figuras dibujadas a mano y el cantor las va nombrando. Gana quien llena primero su cartón.', 30, 'game', ['family', 'kids', 'quiet'], 3, 10, 4, ['cartones dibujados a mano'], ES('Loter%C3%ADa_(juego)'), true],
  // ---- H4: board games (need the board, a set, or an app) ----------------------
  ['ajedrez', 'Ajedrez', 'Una partida a la antigua, o con reloj de celular para hacerla rápida. Si no hay tablero, se juega en una app o web gratuita en el celular. Si uno recién empieza, el otro juega sin la dama.', 45, 'game', ['romantic', 'family', 'solo', 'quiet'], 1, 2, 7, ['un tablero o una app gratuita de ajedrez'], ES('Ajedrez'), true],
  ['damas', 'Damas', 'Cada jugador mueve sus fichas en diagonal y come saltando sobre las del rival; la que llega al fondo se corona. Sin tablero, se dibuja uno en papel y se juega con tapitas de dos colores.', 30, 'game', ['family', 'kids', 'romantic', 'quiet'], 2, 2, 6, ['un tablero o uno dibujado en papel y tapitas'], ES('Damas'), true],
  ['domino', 'Dominó', 'Se reparten las fichas y por turnos se encastran por el número que coincide. Quien se queda sin fichas primero gana la mano; se juega a 100 puntos. Hace falta un juego de dominó: si no tienen uno, hay que comprarlo.', 30, 'game', ['family', 'kids', 'quiet'], 2, 4, 6, ['un juego de dominó'], ES('Domin%C3%B3'), false],
  ['noche-de-juegos-de-mesa', 'Noche de juegos de mesa', 'Cada uno trae el juego de mesa que tenga y se arma una ronda por mesa, rotando cada media hora. Hace falta tener los juegos: si hay que comprar alguno, el costo es el del juego.', 120, 'game', ['friends', 'family', 'big_group', 'quiet'], 3, 16, 8, ['juegos de mesa propios'], ES('Juego_de_mesa'), false],
  ['rompecabezas-en-equipo', 'Rompecabezas en equipo', 'Se arma entre todos un rompecabezas, empezando por los bordes. Con música y mate es un plan tranquilo de tarde de lluvia. Hace falta tener uno: si no, hay que comprarlo.', 90, 'game', ['family', 'romantic', 'solo', 'quiet', 'indoor'], 1, 6, 5, ['un rompecabezas'], ES('Rompecabezas'), false],
  // ---- H5: creative plans at home ----------------------------------------------
  ['karaoke-casero', 'Karaoke casero', 'Se busca la pista con letra en el celular o la tele y se canta por turnos o en dúo. Para animar la juntada: una ronda de rock nacional y otra de cumbia.', 60, 'home_plan', ['friends', 'family', 'big_group', 'party'], 2, 15, 6, ['un celular o una tele con internet'], ES('Karaoke'), true],
  ['noche-de-talentos', 'Noche de talentos', 'Cada uno prepara un número corto (cantar, un truco, un chiste, bailar) y lo presenta. Los demás votan con aplausos y se entrega un premio inventado.', 60, 'home_plan', ['family', 'friends', 'kids', 'party'], 3, 15, 5, ['nada'], EN('Talent_show'), true],
  ['coreografia-viral', 'Reto de coreografía viral', 'Se elige un baile de moda en redes y se aprende entre todos en el living; después se graba solo para el grupo. Nada se publica sin el permiso de todos y nunca a menores.', 40, 'home_plan', ['friends', 'family', 'party'], 2, 10, 10, ['un celular con música'], EN('Dance_challenge'), true],
  ['cine-en-casa-tematico', 'Cine en casa temático', 'Se elige un tema (películas de los 90, una saga, terror) y se arma la sala: luces bajas, almohadones y algo para picar. El precio depende de la plataforma y de lo que compren para comer.', 150, 'home_plan', ['romantic', 'friends', 'family', 'quiet', 'indoor'], 1, 8, null, ['una tele o proyector y una plataforma de películas'], ES('Cine_en_casa'), false],
  ['cocinar-juntos', 'Cocinar juntos', 'Se elige una receta (pizzas caseras, empanadas, pastas) y se reparte el trabajo. Después se come lo que salió. El costo es el de los ingredientes.', 120, 'home_plan', ['romantic', 'family', 'friends', 'kids', 'quiet'], 2, 8, null, ['ingredientes de la receta'], null, false],
  ['spa-casero', 'Spa casero', 'Música tranquila, mascarillas caseras, masajes por turnos y algo rico para tomar. Un plan de descanso en pareja o entre amigas. El costo depende de lo que compren.', 90, 'home_plan', ['romantic', 'friends', 'quiet', 'indoor'], 1, 4, 14, ['toallas, cremas o mascarillas'], null, false],
  ['picnic-en-el-living', 'Picnic en el living', 'Mantel en el piso, comida para picar y juegos de cartas. Para un día de lluvia o una noche distinta sin salir. El costo es el de la comida.', 90, 'home_plan', ['romantic', 'family', 'kids', 'quiet', 'indoor'], 2, 8, null, ['un mantel y algo para comer'], ES('Picnic'), false],
  ['papiroflexia', 'Tarde de origami', 'Con hojas cualquiera se aprenden figuras simples (barco, grulla, avión) siguiendo un video o un diagrama. Después, competencia de aviones de papel en el living.', 45, 'home_plan', ['family', 'kids', 'solo', 'quiet', 'indoor'], 1, 8, 6, ['hojas de papel'], ES('Papiroflexia'), true],
  ['lectura-en-voz-alta', 'Lectura en voz alta', 'Se elige un cuento o un capítulo de un libro y se lee por turnos, con voces para cada personaje. Al final cada uno cuenta qué le pareció.', 45, 'home_plan', ['family', 'kids', 'romantic', 'quiet', 'indoor'], 2, 8, 4, ['un libro'], ES('Club_de_lectura'), true],
  ['obra-de-titeres', 'Obra de títeres casera', 'Con medias, bolsas o papel se arman títeres y una mesa dada vuelta hace de escenario. Los chicos inventan la historia y la presentan al resto.', 60, 'home_plan', ['family', 'kids', 'quiet', 'indoor'], 2, 10, 4, ['medias viejas, papel y marcadores'], ES('T%C3%ADtere'), true],
  ['teatro-de-sombras', 'Teatro de sombras', 'Con una sábana y una linterna (la del celular sirve) se proyectan sombras de manos y figuras recortadas. Se arma una historia corta y se presenta con las luces apagadas.', 45, 'home_plan', ['family', 'kids', 'romantic', 'quiet', 'indoor'], 2, 10, 4, ['una sábana, una linterna y cartón'], ES('Teatro_de_sombras'), true],
  ['busqueda-del-tesoro-en-casa', 'Búsqueda del tesoro en casa', 'Alguien esconde un «tesoro» y deja pistas encadenadas en distintos lugares de la casa; cada pista lleva a la siguiente. Se juega en equipos y con acertijos para los más grandes, sin salir de la casa.', 45, 'game', ['family', 'kids', 'friends', 'indoor'], 2, 12, 5, ['papel y lápiz para las pistas'], EN('Treasure_hunt_(game)'), true],
  ['escondidas', 'Escondidas en casa', 'Uno cuenta con los ojos tapados mientras los demás se esconden en la casa (sin salir ni subir a lugares peligrosos); después los busca. El primero encontrado cuenta en la próxima ronda.', 30, 'game', ['family', 'kids', 'indoor'], 3, 10, 4, ['nada'], ES('Escondidas'), true],
  // ---- H6: party and challenges --------------------------------------------------
  ['verdad-o-reto', 'Verdad o reto', 'Por turnos cada uno elige responder una pregunta con sinceridad o cumplir un reto. Sin retos peligrosos, sin alcohol y sin publicar nada de nadie: el que no quiere, pasa.', 40, 'game', ['friends', 'big_group', 'party'], 3, 12, 14, ['nada'], ES('Verdad_o_reto'), true],
  ['yo-nunca-nunca', 'Yo nunca nunca (sin alcohol)', 'Cada uno dice algo que nunca hizo; quien sí lo hizo baja un dedo. Pierde el primero que se queda sin dedos. En esta versión no se toma: se cuentan dedos.', 30, 'game', ['friends', 'big_group', 'party'], 3, 15, 14, ['nada'], EN('Never_have_I_ever'), true],
  ['piedra-papel-o-tijera-torneo', 'Torneo de piedra, papel o tijera', 'Llaves eliminatorias al mejor de tres hasta coronar al campeón de la casa. Sirve para decidir quién elige la película o quién lava los platos.', 15, 'game', ['family', 'kids', 'friends', 'party'], 2, 16, 4, ['nada'], ES('Piedra,_papel_o_tijera'), true],
  ['sillas-musicales', 'Sillas musicales', 'Se ponen sillas en ronda en el living, una menos que jugadores. Mientras suena la música todos caminan alrededor; cuando para, hay que sentarse. El que queda parado sale y se saca una silla.', 20, 'game', ['family', 'kids', 'big_group', 'party'], 4, 15, 4, ['sillas y música'], ES('Juego_de_las_sillas'), true],
  ['simon-dice', 'Simón dice', 'Un «Simón» da órdenes; solo se cumplen las que empiezan con «Simón dice». El que obedece una orden sin esa frase queda afuera.', 15, 'game', ['family', 'kids', 'party'], 3, 20, 3, ['nada'], ES('Sim%C3%B3n_dice'), true],
  ['papa-caliente', 'Papa caliente', 'Se pasa un objeto blando en ronda mientras suena música; cuando para, quien lo tiene queda afuera o cumple una prenda simple.', 15, 'game', ['family', 'kids', 'big_group', 'party'], 4, 20, 3, ['un objeto blando y música'], ES('Papa_caliente'), true],
  ['estatuas-musicales', 'Estatuas musicales', 'Todos bailan en el living mientras suena la música y se quedan quietos como estatuas cuando se corta. El que se mueve, sale. Gana el último en pie.', 15, 'game', ['family', 'kids', 'party'], 3, 20, 3, ['música'], EN('Statues_(game)'), true],
];

/** Words that mean the activity happens out of the house: never at the Hogar. */
const OUT_OF_HOME = /\b(plaza|parque|pasto|vereda|patio|aire libre|tierra)\b/i;

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
    if (occasions.includes('outdoor') || OUT_OF_HOME.test(`${name} ${description}`))
      throw new Error(`${slug} happens out of the house: it does not belong to the Hogar`);
    if (!minPeople || !minutes || !materials.length)
      throw new Error(`${slug} needs people, a duration and its materials`);
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
