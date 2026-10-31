/**
 * The requests Intelligent Search v1 is judged on (evaluation V2). A
 * scenario states what a knowledgeable Mendoza local would require of the
 * answer: the experiences that must be really satisfied, the zone, whether
 * an honest "no" is the correct answer. A generated plan is not success.
 */
import type { ExperienceKey } from '../intent/experiences';

export type ScenarioGroup = 'gastronomy' | 'experience' | 'zone' | 'failure';

export interface EvalScenario {
  id: number;
  query: string;
  group: ScenarioGroup;
  /** Experiences the person explicitly asked for (must be SATISFIED). */
  requires?: ExperienceKey[];
  /** The plan may legitimately anchor on a generic public space. */
  allowsPublicSpaceAnchor?: boolean;
  /** The correct answer is an honest, helpful "not like this". */
  expectsNoPlan?: boolean;
  /** Department the plan should happen in (zone scenarios). */
  department?: string;
  /** Context trait whose evidence should shape the anchor ranking. */
  context?: 'romantic' | 'good_for_groups' | 'good_value' | 'premium';
  /** Local time override (HH:MM on the evaluation date). */
  at?: string;
  /**
   * Games and plans at home (#210): `all` = every stop at home, `none` = no
   * stop at home, `closing` = something out first and home only at the end.
   */
  home?: 'all' | 'none' | 'closing';
  /** Every stop must be evidenced free. */
  free?: boolean;
}

export const EVAL_SCENARIOS: EvalScenario[] = [
  {
    id: 30,
    query: 'Un lugar fachero para tomar algo.',
    group: 'gastronomy',
    requires: ['drinks'],
  },
  {
    id: 31,
    query: 'Cena romántica para dos, máximo $80.000.',
    group: 'gastronomy',
    requires: ['dinner'],
    context: 'romantic',
  },
  {
    id: 32,
    query: 'Birra y algo para picar con amigos.',
    group: 'gastronomy',
    requires: ['beer'],
  },
  {
    id: 33,
    query: 'Una merienda linda.',
    group: 'gastronomy',
    requires: ['merienda'],
  },
  { id: 34, query: 'Una salida familiar.', group: 'experience' },
  {
    id: 35,
    query: 'Algo divertido que no sea comer.',
    group: 'experience',
    requires: ['fun'],
  },
  {
    id: 36,
    query: 'Un día en Potrerillos.',
    group: 'zone',
    allowsPublicSpaceAnchor: true,
  },
  {
    id: 37,
    query: 'Algo cultural esta noche.',
    group: 'experience',
    requires: ['culture'],
  },
  {
    id: 38,
    query: 'Una experiencia de aventura.',
    group: 'experience',
    requires: ['adventure'],
  },
  {
    id: 39,
    query: 'Un plan barato en Godoy Cruz.',
    group: 'zone',
    department: 'Godoy Cruz',
    allowsPublicSpaceAnchor: true,
  },
  {
    id: 40,
    query: 'Quiero hacer algo ahora.',
    group: 'experience',
    allowsPublicSpaceAnchor: true,
  },
  {
    id: 41,
    query: 'Una cita con onda pero tranquila.',
    group: 'experience',
    context: 'romantic',
  },
  // Gastronomy (reference vertical).
  {
    id: 1,
    query: 'Cena romántica para dos por menos de $70.000',
    group: 'gastronomy',
    requires: ['dinner'],
    context: 'romantic',
  },
  { id: 2, query: 'Primera cita', group: 'gastronomy', context: 'romantic' },
  {
    id: 3,
    query: 'Salir a comer con amigos',
    group: 'gastronomy',
    requires: ['dinner'],
    context: 'good_for_groups',
  },
  { id: 4, query: 'Comer barato', group: 'gastronomy', context: 'good_value' },
  { id: 5, query: 'Brunch', group: 'gastronomy', requires: ['brunch'] },
  { id: 6, query: 'Merienda', group: 'gastronomy', requires: ['merienda'] },
  {
    id: 7,
    query: 'Cerveza con amigos',
    group: 'gastronomy',
    requires: ['beer'],
    context: 'good_for_groups',
  },
  { id: 8, query: 'Algo premium', group: 'gastronomy', context: 'premium' },
  { id: 15, query: 'Un café de especialidad tranquilo', group: 'gastronomy' },
  {
    id: 16,
    query: 'Tomar unos tragos a la noche',
    group: 'gastronomy',
    requires: ['drinks'],
  },
  {
    id: 17,
    query: 'Helado después de cenar',
    group: 'gastronomy',
    requires: ['dinner', 'dessert'],
  },
  {
    id: 18,
    query: 'Almuerzo en familia el domingo',
    group: 'gastronomy',
    requires: ['lunch'],
  },
  {
    id: 19,
    query: 'Cena con vista linda',
    group: 'gastronomy',
    requires: ['dinner'],
  },
  {
    id: 20,
    query: 'Cena para seis amigos por menos de $25.000 cada uno',
    group: 'gastronomy',
    requires: ['dinner'],
    context: 'good_for_groups',
  },
  // Experiences.
  {
    id: 9,
    query: 'Cine y cena',
    group: 'experience',
    requires: ['movie', 'dinner'],
  },
  {
    id: 10,
    query: 'Algo gratis al aire libre',
    group: 'experience',
    allowsPublicSpaceAnchor: true,
  },
  {
    id: 11,
    query: 'Bodega y almuerzo en Valle de Uco',
    group: 'experience',
    requires: ['wine', 'lunch'],
  },
  {
    id: 12,
    query: 'Qué podemos hacer ahora durante tres horas',
    group: 'experience',
    allowsPublicSpaceAnchor: true,
  },
  { id: 13, query: 'Plan familiar', group: 'experience' },
  { id: 14, query: 'Algo para hacer si llueve', group: 'experience' },
  {
    id: 21,
    query: 'Ir al cine a la noche',
    group: 'experience',
    requires: ['movie'],
  },
  {
    id: 22,
    query: 'Visitar una bodega en Maipú',
    group: 'experience',
    requires: ['wine'],
    department: 'Maipú',
  },
  // Zones.
  {
    id: 23,
    query: 'Cenar en Godoy Cruz',
    group: 'zone',
    requires: ['dinner'],
    department: 'Godoy Cruz',
  },
  {
    id: 24,
    query: 'Cena en Chacras de Coria',
    group: 'zone',
    requires: ['dinner'],
    department: 'Luján de Cuyo',
  },
  {
    id: 25,
    query: 'Almorzar en Maipú',
    group: 'zone',
    requires: ['lunch'],
    department: 'Maipú',
  },
  {
    id: 26,
    query: 'Cenar en San Rafael',
    group: 'zone',
    requires: ['dinner'],
    department: 'San Rafael',
  },
  {
    id: 27,
    query: 'Merienda en Guaymallén',
    group: 'zone',
    requires: ['merienda'],
    department: 'Guaymallén',
  },
  // Honest failures.
  {
    id: 28,
    query: 'Quiero ir al cine ahora y después comer sushi por menos de $10.000',
    group: 'failure',
    requires: ['movie', 'dinner'],
    expectsNoPlan: true,
  },
  {
    id: 29,
    query: 'Cena romántica para dos por menos de $8.000',
    group: 'failure',
    requires: ['dinner'],
    expectsNoPlan: true,
  },
  // Games at home and catalog occasions (#210, #135).
  {
    id: 42,
    query: 'Noche de juegos en casa con 6 personas',
    group: 'experience',
    requires: ['home_game'],
    home: 'all',
  },
  {
    id: 43,
    query: 'Plan gratis con amigos',
    group: 'experience',
    allowsPublicSpaceAnchor: true,
    free: true,
  },
  {
    id: 44,
    query: 'Somos 4 y tenemos $16.000 para salir con amigos',
    group: 'experience',
  },
  {
    id: 45,
    query: 'Cena romántica con mi novia',
    group: 'gastronomy',
    requires: ['dinner'],
    context: 'romantic',
    home: 'none',
  },
  {
    id: 46,
    query: 'Con los nenes un domingo de lluvia',
    group: 'experience',
    home: 'none',
  },
  {
    id: 47,
    query: 'Plan gratis en Luján de Cuyo con amigos',
    group: 'zone',
    department: 'Luján de Cuyo',
    allowsPublicSpaceAnchor: true,
    free: true,
    home: 'closing',
  },
  {
    id: 48,
    query: 'No tengo un peso y quiero hacer algo con amigos',
    group: 'experience',
    allowsPublicSpaceAnchor: true,
    free: true,
  },
  {
    id: 49,
    query: 'Quiero comer con amigos y después hacer algo en mi casa',
    group: 'experience',
    requires: ['dinner', 'at_home'],
    home: 'closing',
  },
];
