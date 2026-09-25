export interface InterpretIntentInput {
  rawQuery: string;
  context: {
    budget?: number;
    departmentName?: string;
    partySize?: number;
    timeOfDay?: string;
    availableDuration?: number;
  };
  knownBudget?: number;
  knownDepartmentId?: number;
  knownPartySize?: number;
  knownAvailableDuration?: number;
  candidateDepartments: Array<{ id: number; name: string }>;
  candidateCategories: Array<{ id: number; name: string }>;
}

export interface InterpretedIntent {
  budget: number | null;
  departmentName: string | null;
  categoryNames: string[];
  partySize: number | null;
  availableDuration: number | null;
}
