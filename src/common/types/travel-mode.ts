export const TRAVEL_MODES = ['drive', 'walk', 'bicycle'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];
