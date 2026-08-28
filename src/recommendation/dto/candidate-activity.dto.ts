export interface CandidateActivity {
  id: number;
  name: string;
  description: string;
  estimatedCost: number;
  estimatedDuration: number;
  categoryNames: string[];
  latitude: number | null;
  longitude: number | null;
}
