export interface UserPreferenceCategoryDto {
  id: number;
  name: string;
  description: string | null;
}

export interface UserPreferencesResponseDto {
  categories: UserPreferenceCategoryDto[];
}
