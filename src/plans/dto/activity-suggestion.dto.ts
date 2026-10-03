/** One catalog activity suggested for the plan being edited (#98). */
export interface ActivitySuggestionDto {
  id: number;
  name: string;
  description: string;
  estimatedCost: number;
  estimatedDuration: number;
  type: string | null;
  categories: string[];
}
