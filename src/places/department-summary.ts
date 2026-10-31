import type { Department } from '../places/entities/department.entity';

export interface DepartmentSummaryDto {
  id: number;
  name: string;
  city: {
    id: number;
    name: string;
    country: { id: number; name: string };
  };
}

/** A department with its city and country; `null` for the Hogar, which has none. */
export function departmentSummaryOf(
  department: Department | null | undefined,
): DepartmentSummaryDto | null {
  if (!department) return null;
  return {
    id: department.id,
    name: department.name,
    city: {
      id: department.city.id,
      name: department.city.name,
      country: {
        id: department.city.country.id,
        name: department.city.country.name,
      },
    },
  };
}
