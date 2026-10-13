import { USER_ROLE } from './definitions';

export interface CountryDefinition {
  name: string;
  description: string;
}

export interface CityDefinition {
  name: string;
  description: string;
  country: string;
}

export interface DepartmentDefinition {
  name: string;
  description: string;
  city: string;
}

export interface PlaceDefinition {
  name: string;
  description: string;
  address: string;
  department: string;
}

export interface ActivityPlaceDefinition {
  place: string;
  latitude?: number;
  longitude?: number;
}

export interface ActivityDefinition {
  name: string;
  description: string;
  estimatedCost: number;
  estimatedDuration: number;
  type: string;
  categories: readonly string[];
  places: readonly ActivityPlaceDefinition[];
}

export const DEMO_COUNTRIES: readonly CountryDefinition[] = [
  {
    name: 'Argentina',
    description: 'País de origen de los planes de ejemplo.',
  },
];

export const DEMO_CITIES: readonly CityDefinition[] = [
  {
    name: 'Córdoba',
    description: 'Provincia de Córdoba, Argentina.',
    country: 'Argentina',
  },
];

export const DEMO_DEPARTMENTS: readonly DepartmentDefinition[] = [
  {
    name: 'Capital',
    description: 'Ciudad de Córdoba capital.',
    city: 'Córdoba',
  },
  {
    name: 'Punilla',
    description: 'Valle de Punilla, Sierras de Córdoba.',
    city: 'Córdoba',
  },
];

export const DEMO_PLACES: readonly PlaceDefinition[] = [
  {
    name: 'Alcorta Shopping',
    description: 'Centro comercial con propuesta gastronómica.',
    address: 'Bv. Los Alemanes 940, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Cerro Los Gigantes',
    description: 'Reserva natural en las Sierras Grandes.',
    address: 'Ruta Provincial 14, Villa Carlos Paz',
    department: 'Punilla',
  },
  {
    name: 'Museo Caraffa',
    description: 'Museo de bellas artes de la ciudad de Córdoba.',
    address: 'Av. Poeta Lugones 411, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Patio Olmos Shopping',
    description: 'Centro comercial con cine y entretenimiento.',
    address: 'Av. Vélez Sarsfield 361, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Barrio Güemes',
    description: 'Barrio histórico con bares y vida nocturna.',
    address: 'Belgrano al 800, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Complejo Deportivo Talleres',
    description: 'Complejo de canchas de pádel y fútbol.',
    address: 'Av. Ricchieri 2196, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Studio Theater',
    description: 'Sala de recitales y shows en vivo.',
    address: 'Ituzaingó 262, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Termas de Villa Carlos Paz',
    description: 'Complejo termal y de relax.',
    address: 'Av. Illia 1000, Villa Carlos Paz',
    department: 'Punilla',
  },
  {
    name: 'Paseo de las Artes',
    description: 'Feria de artesanos y productores locales.',
    address: 'Belgrano y Achával Rodríguez, Córdoba',
    department: 'Capital',
  },
  {
    name: 'La Cumbrecita',
    description: 'Pueblo peatonal en las Sierras Grandes.',
    address: 'La Cumbrecita, Córdoba',
    department: 'Punilla',
  },
  {
    name: 'Mercado Norte',
    description:
      'Mercado tradicional con puestos de comida y productos regionales.',
    address: 'Rivadavia y Yrigoyen, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Bodega La Caroyense',
    description: 'Bodega boutique con degustación de vinos de la zona.',
    address: 'Ruta E-53, Colonia Caroya, Córdoba',
    department: 'Punilla',
  },
  {
    name: 'Estancia Los Cocos',
    description: 'Estancia con caballerizas para cabalgatas en las sierras.',
    address: 'Camino a Los Cocos, Villa Carlos Paz',
    department: 'Punilla',
  },
  {
    name: 'Parque Sarmiento',
    description: 'Parque urbano con lago, senderos y espacios verdes.',
    address: 'Av. Poeta Lugones s/n, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Centro Cultural Córdoba',
    description: 'Espacio cultural con exposiciones y actividades artísticas.',
    address: 'Av. Poeta Lugones 401, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Manzana Jesuítica',
    description: 'Sitio histórico patrimonio de la humanidad.',
    address: 'Obispo Trejo 242, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Escape Room Córdoba',
    description: 'Salas temáticas de escape con distintos desafíos.',
    address: 'San Jerónimo 450, Córdoba',
    department: 'Capital',
  },
  {
    name: "Kiddy's Park",
    description: 'Parque de diversiones familiar con juegos y atracciones.',
    address: 'Av. Fuerza Aérea 5000, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Sunset Rooftop Bar',
    description: 'Bar en altura con vista a la ciudad.',
    address: 'Av. Hipólito Yrigoyen 146, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Karaoke Bar Nuevocentro',
    description: 'Bar temático con salas privadas de karaoke.',
    address: 'Duarte Quirós 1400, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Polideportivo Kempes',
    description: 'Complejo deportivo con canchas de fútbol 5 y básquet.',
    address: 'Av. Cárcano s/n, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Boulder Córdoba',
    description: 'Gimnasio de escalada indoor para todos los niveles.',
    address: 'Bv. Guzmán 350, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Quality Espacio',
    description: 'Sala de recitales de mediana capacidad.',
    address: 'Av. Cárcano 1450, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Peña El Aljibe',
    description: 'Peña folclórica con música y comida regional en vivo.',
    address: 'Ruta 38, Villa Carlos Paz',
    department: 'Punilla',
  },
  {
    name: 'Spa Urbano Nüwa',
    description: 'Centro de spa y relax en pleno centro de la ciudad.',
    address: 'Av. Colón 550, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Feria Manantial',
    description: 'Feria de diseño independiente y productos artesanales.',
    address: 'Bv. Chacabuco 1200, Córdoba',
    department: 'Capital',
  },
  {
    name: 'Dique San Roque',
    description: 'Espejo de agua para pesca y actividades náuticas.',
    address: 'Ruta 38, Villa Carlos Paz',
    department: 'Punilla',
  },
  {
    name: 'Villa General Belgrano',
    description: 'Pueblo de estilo alpino en las sierras cordobesas.',
    address: 'Villa General Belgrano, Córdoba',
    department: 'Punilla',
  },
];

export const DEMO_ACTIVITIES: readonly ActivityDefinition[] = [
  {
    name: 'Cena de autor en Alcorta',
    description: 'Cena en un restó de cocina de autor dentro del shopping.',
    estimatedCost: 18000,
    estimatedDuration: 120,
    type: 'gastronomy',
    categories: ['Gastronomy'],
    places: [{ place: 'Alcorta Shopping' }],
  },
  {
    name: 'Trekking en Los Gigantes',
    description: 'Caminata guiada por senderos de montaña.',
    estimatedCost: 8000,
    estimatedDuration: 240,
    type: 'outdoor',
    categories: ['Outdoors'],
    places: [
      { place: 'Cerro Los Gigantes', latitude: -31.417, longitude: -64.75 },
    ],
  },
  {
    name: 'Visita al Museo Caraffa',
    description: 'Recorrido guiado por las salas del museo.',
    estimatedCost: 3000,
    estimatedDuration: 90,
    type: 'culture',
    categories: ['Culture'],
    places: [
      { place: 'Museo Caraffa', latitude: -31.4181, longitude: -64.1888 },
    ],
  },
  {
    name: 'Función de cine en Patio Olmos',
    description: 'Función de cine en el complejo del shopping.',
    estimatedCost: 6000,
    estimatedDuration: 150,
    type: 'entertainment',
    categories: ['Entertainment'],
    places: [{ place: 'Patio Olmos Shopping' }],
  },
  {
    name: 'Noche de bar en Güemes',
    description: 'Recorrida de bares en el barrio Güemes.',
    estimatedCost: 12000,
    estimatedDuration: 180,
    type: 'nightlife',
    categories: ['Nightlife'],
    places: [{ place: 'Barrio Güemes' }],
  },
  {
    name: 'Pádel en Complejo Talleres',
    description: 'Turno de cancha de pádel para dos parejas.',
    estimatedCost: 10000,
    estimatedDuration: 90,
    type: 'sports',
    categories: ['Sports'],
    places: [{ place: 'Complejo Deportivo Talleres' }],
  },
  {
    name: 'Show en vivo en Studio Theater',
    description: 'Recital de una banda local en vivo.',
    estimatedCost: 15000,
    estimatedDuration: 180,
    type: 'live-music',
    categories: ['Live music'],
    places: [{ place: 'Studio Theater' }],
  },
  {
    name: 'Día de spa en Villa Carlos Paz',
    description: 'Circuito termal y de relax de medio día.',
    estimatedCost: 22000,
    estimatedDuration: 300,
    type: 'wellness',
    categories: ['Wellness'],
    places: [
      {
        place: 'Termas de Villa Carlos Paz',
        latitude: -31.4241,
        longitude: -64.4978,
      },
    ],
  },
  {
    name: 'Feria en el Paseo de las Artes',
    description: 'Recorrida de puestos de artesanos y productores.',
    estimatedCost: 5000,
    estimatedDuration: 120,
    type: 'shopping',
    categories: ['Shopping'],
    places: [{ place: 'Paseo de las Artes' }],
  },
  {
    name: 'Excursión a La Cumbrecita',
    description: 'Día completo recorriendo el pueblo peatonal.',
    estimatedCost: 25000,
    estimatedDuration: 480,
    type: 'short-trip',
    categories: ['Short trips'],
    places: [
      { place: 'La Cumbrecita', latitude: -31.8944, longitude: -64.7967 },
    ],
  },
  {
    name: 'Almuerzo en Mercado Norte',
    description: 'Recorrida de puestos y almuerzo en el mercado tradicional.',
    estimatedCost: 9000,
    estimatedDuration: 90,
    type: 'gastronomy',
    categories: ['Gastronomy'],
    places: [{ place: 'Mercado Norte' }],
  },
  {
    name: 'Degustación de vinos en bodega boutique',
    description: 'Cata guiada de vinos regionales con maridaje.',
    estimatedCost: 16000,
    estimatedDuration: 120,
    type: 'gastronomy',
    categories: ['Gastronomy'],
    places: [{ place: 'Bodega La Caroyense' }],
  },
  {
    name: 'Cabalgata por las sierras',
    description: 'Paseo a caballo con guía por senderos serranos.',
    estimatedCost: 14000,
    estimatedDuration: 180,
    type: 'outdoor',
    categories: ['Outdoors'],
    places: [{ place: 'Estancia Los Cocos' }],
  },
  {
    name: 'Picnic en Parque Sarmiento',
    description: 'Tarde de picnic y juegos al aire libre en el parque.',
    estimatedCost: 4000,
    estimatedDuration: 120,
    type: 'outdoor',
    categories: ['Outdoors'],
    places: [{ place: 'Parque Sarmiento' }],
  },
  {
    name: 'Recorrido por el Centro Cultural Córdoba',
    description: 'Visita guiada por las exposiciones del centro cultural.',
    estimatedCost: 2500,
    estimatedDuration: 90,
    type: 'culture',
    categories: ['Culture'],
    places: [{ place: 'Centro Cultural Córdoba' }],
  },
  {
    name: 'Tour histórico por la Manzana Jesuítica',
    description: 'Recorrido guiado por el patrimonio histórico jesuítico.',
    estimatedCost: 3500,
    estimatedDuration: 100,
    type: 'culture',
    categories: ['Culture'],
    places: [{ place: 'Manzana Jesuítica' }],
  },
  {
    name: 'Escape room en el centro',
    description: 'Sala temática de escape para grupos de amigos.',
    estimatedCost: 7000,
    estimatedDuration: 60,
    type: 'entertainment',
    categories: ['Entertainment'],
    places: [{ place: 'Escape Room Córdoba' }],
  },
  {
    name: 'Parque de diversiones familiar',
    description: 'Tarde de juegos y atracciones para toda la familia.',
    estimatedCost: 11000,
    estimatedDuration: 180,
    type: 'entertainment',
    categories: ['Entertainment'],
    places: [{ place: "Kiddy's Park" }],
  },
  {
    name: 'After office en rooftop',
    description: 'Tragos y música en una terraza con vista a la ciudad.',
    estimatedCost: 13000,
    estimatedDuration: 150,
    type: 'nightlife',
    categories: ['Nightlife'],
    places: [{ place: 'Sunset Rooftop Bar' }],
  },
  {
    name: 'Noche de karaoke',
    description: 'Sala privada de karaoke con amigos.',
    estimatedCost: 10000,
    estimatedDuration: 120,
    type: 'nightlife',
    categories: ['Nightlife'],
    places: [{ place: 'Karaoke Bar Nuevocentro' }],
  },
  {
    name: 'Partido de fútbol 5',
    description: 'Turno de cancha de fútbol 5 entre amigos.',
    estimatedCost: 8000,
    estimatedDuration: 90,
    type: 'sports',
    categories: ['Sports'],
    places: [{ place: 'Polideportivo Kempes' }],
  },
  {
    name: 'Clase de escalada indoor',
    description: 'Clase guiada de escalada en muro indoor.',
    estimatedCost: 9000,
    estimatedDuration: 90,
    type: 'sports',
    categories: ['Sports'],
    places: [{ place: 'Boulder Córdoba' }],
  },
  {
    name: 'Recital en Quality Espacio',
    description: 'Show en vivo de una banda nacional.',
    estimatedCost: 20000,
    estimatedDuration: 180,
    type: 'live-music',
    categories: ['Live music'],
    places: [{ place: 'Quality Espacio' }],
  },
  {
    name: 'Peña folclórica',
    description: 'Noche de música folclórica en vivo con cena regional.',
    estimatedCost: 15000,
    estimatedDuration: 180,
    type: 'live-music',
    categories: ['Live music'],
    places: [{ place: 'Peña El Aljibe' }],
  },
  {
    name: 'Clase de yoga al aire libre',
    description: 'Clase grupal de yoga en el parque.',
    estimatedCost: 3000,
    estimatedDuration: 60,
    type: 'wellness',
    categories: ['Wellness'],
    places: [{ place: 'Parque Sarmiento' }],
  },
  {
    name: 'Circuito de spa urbano',
    description: 'Circuito de relax con sauna y masajes en el centro.',
    estimatedCost: 18000,
    estimatedDuration: 150,
    type: 'wellness',
    categories: ['Wellness'],
    places: [{ place: 'Spa Urbano Nüwa' }],
  },
  {
    name: 'Compras en Mercado Norte',
    description: 'Recorrida de compras de productos regionales.',
    estimatedCost: 6000,
    estimatedDuration: 90,
    type: 'shopping',
    categories: ['Shopping'],
    places: [{ place: 'Mercado Norte' }],
  },
  {
    name: 'Feria de diseño independiente',
    description: 'Feria de productos de diseñadores y artesanos locales.',
    estimatedCost: 4500,
    estimatedDuration: 100,
    type: 'shopping',
    categories: ['Shopping'],
    places: [{ place: 'Feria Manantial' }],
  },
  {
    name: 'Día de pesca en el Dique San Roque',
    description: 'Jornada de pesca deportiva en el dique.',
    estimatedCost: 12000,
    estimatedDuration: 240,
    type: 'short-trip',
    categories: ['Short trips'],
    places: [{ place: 'Dique San Roque' }],
  },
  {
    name: 'Recorrido por Villa General Belgrano',
    description: 'Día completo recorriendo el pueblo de estilo alpino.',
    estimatedCost: 22000,
    estimatedDuration: 420,
    type: 'short-trip',
    categories: ['Short trips'],
    places: [{ place: 'Villa General Belgrano' }],
  },
];

export const DEMO_USER = {
  name: 'Demo',
  lastName: 'SmartPlan',
  email: 'demo@smartplan.local',
  password: 'Demo12345!',
  role: USER_ROLE,
  status: 'active',
} as const;

export interface DemoPlanDetailDefinition {
  activity: string;
  order: number;
  note?: string;
}

export interface DemoPlanDefinition {
  title: string;
  description: string;
  status: string;
  peopleCount: number;
  details: readonly DemoPlanDetailDefinition[];
}

export const DEMO_PLANS: readonly DemoPlanDefinition[] = [
  {
    title: 'Finde en las sierras',
    description: 'Escapada de un día a Punilla con trekking y termas.',
    status: 'confirmed',
    peopleCount: 2,
    details: [
      { activity: 'Trekking en Los Gigantes', order: 1 },
      { activity: 'Día de spa en Villa Carlos Paz', order: 2 },
    ],
  },
  {
    title: 'Noche en el centro',
    description: 'Cena, cine y bar por el centro de Córdoba.',
    status: 'completed',
    peopleCount: 4,
    details: [
      { activity: 'Cena de autor en Alcorta', order: 1 },
      { activity: 'Función de cine en Patio Olmos', order: 2 },
      { activity: 'Noche de bar en Güemes', order: 3 },
    ],
  },
  {
    title: 'Día cultural en el centro',
    description: 'Recorrido histórico y cultural con almuerzo en el mercado.',
    status: 'generated',
    peopleCount: 2,
    details: [
      { activity: 'Recorrido por el Centro Cultural Córdoba', order: 1 },
      { activity: 'Tour histórico por la Manzana Jesuítica', order: 2 },
      { activity: 'Almuerzo en Mercado Norte', order: 3 },
    ],
  },
  {
    title: 'Aventura en las sierras',
    description: 'Cabalgata y picnic al aire libre.',
    status: 'selected',
    peopleCount: 3,
    details: [
      { activity: 'Cabalgata por las sierras', order: 1 },
      { activity: 'Picnic en Parque Sarmiento', order: 2 },
    ],
  },
  {
    title: 'Noche de amigos',
    description: 'Rooftop y karaoke para cerrar la noche.',
    status: 'confirmed',
    peopleCount: 5,
    details: [
      { activity: 'After office en rooftop', order: 1 },
      { activity: 'Noche de karaoke', order: 2 },
    ],
  },
  {
    title: 'Tarde deportiva',
    description: 'Fútbol 5 y escalada indoor entre amigos.',
    status: 'completed',
    peopleCount: 4,
    details: [
      { activity: 'Partido de fútbol 5', order: 1 },
      { activity: 'Clase de escalada indoor', order: 2 },
    ],
  },
  {
    title: 'Folclore y sierras',
    description: 'Peña folclórica y excursión a La Cumbrecita.',
    status: 'completed',
    peopleCount: 2,
    details: [
      { activity: 'Peña folclórica', order: 1 },
      { activity: 'Excursión a La Cumbrecita', order: 2 },
    ],
  },
  {
    title: 'Relax total',
    description: 'Yoga al aire libre y circuito de spa urbano.',
    status: 'selected',
    peopleCount: 2,
    details: [
      { activity: 'Clase de yoga al aire libre', order: 1 },
      { activity: 'Circuito de spa urbano', order: 2 },
    ],
  },
  {
    title: 'Compras y diseño',
    description: 'Recorrida de compras y feria de diseño independiente.',
    status: 'generated',
    peopleCount: 1,
    details: [
      { activity: 'Compras en Mercado Norte', order: 1 },
      { activity: 'Feria de diseño independiente', order: 2 },
    ],
  },
  {
    title: 'Escapada a Villa General Belgrano',
    description: 'Día de pesca y recorrido por el pueblo alpino.',
    status: 'cancelled',
    peopleCount: 4,
    details: [
      { activity: 'Día de pesca en el Dique San Roque', order: 1 },
      { activity: 'Recorrido por Villa General Belgrano', order: 2 },
    ],
  },
];
