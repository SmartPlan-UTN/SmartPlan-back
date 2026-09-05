import { CategoryStatusKey } from './admin-category.dto';

export interface AdminCategoryDto {
  id: number;
  name: string;
  description: string | null;
  status: { key: CategoryStatusKey; name: string };
  createdAt: Date;
  updatedAt: Date;
}
