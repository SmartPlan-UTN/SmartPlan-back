export interface UserPreferenceCategoryDto {
  id: number;
  name: string;
  description: string | null;
}

export interface PreferredAreaResponseDto {
  label: string;
  placeId: string;
  latitude: number;
  longitude: number;
}

export interface UserPreferencesResponseDto {
  categories: UserPreferenceCategoryDto[];
  /**
   * Scalar recommendation profile (CU8/CU18, PAN 15). `null` means the user
   * has not set that preference. `useDeviceLocation` defaults to `false`
   * when no profile has been saved yet. `preferredArea` is the resolved
   * location (label + placeId + coordinates) or `null`.
   */
  usualBudget: number | null;
  usualPeopleCount: number | null;
  preferredArea: PreferredAreaResponseDto | null;
  useDeviceLocation: boolean;
  maxDistanceKm: number | null;
}
