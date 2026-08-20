/**
 * Shape mínimo de salida del spike de Google Maps (ticket #33). No es un DTO de
 * input HTTP: no hay endpoint que lo reciba, así que no lleva
 * `class-validator`.
 */
export interface ResolvedPlaceDto {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}
