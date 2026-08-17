/**
 * Shape mínimo de salida del spike de Google Maps (ticket #33). No es un DTO de
 * entrada HTTP: no hay endpoint que lo reciba, así que no lleva
 * `class-validator`.
 */
export interface DistanciaEntreLugaresDto {
  distanciaMetros: number;
  duracionSegundos: number;
}
