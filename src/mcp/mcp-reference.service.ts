import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { ACTIVITY_SUBTYPES } from '../catalog/taxonomy';
import { PROMOTABLE_LICENSE_CLASSES } from '../catalog/catalog.constants';
import {
  PRICE_KINDS,
  PRICE_SOURCES,
  PRICE_UNITS,
} from '../common/pricing/price';
import { PlanStatus } from '../plans/entities/plan-status.entity';
import { PlanVisibility } from '../plans/entities/plan.entity';
import { OutingType } from '../recommendation/entities/outing-type.entity';
import { Department } from '../places/entities/department.entity';
import { MCP_PLAN_STATUSES } from './mcp-schemas';

/**
 * Values a bot may use. Categories, outing types, plan statuses and the
 * geography are read from the database, never hard-coded here.
 */
@Injectable()
export class McpReferenceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async allowedValues() {
    const manager = this.dataSource.manager;
    const [categories, outingTypes, statuses, departments] = await Promise.all([
      manager.find(Category, {
        relations: { status: true },
        order: { name: 'ASC' },
      }),
      manager.find(OutingType, { order: { name: 'ASC' } }),
      manager.find(PlanStatus, { order: { id: 'ASC' } }),
      manager.find(Department, {
        relations: { city: { country: true } },
        order: { name: 'ASC' },
      }),
    ]);
    const loadable = new Set<string>(MCP_PLAN_STATUSES);
    return {
      categories: categories
        .filter((category) => category.status?.key === 'active')
        .map((category) => category.name),
      outingTypes: outingTypes.map((type) => ({
        key: type.key,
        name: type.name,
      })),
      planStatuses: statuses
        .filter((status) => loadable.has(status.key))
        .map((status) => ({ key: status.key, name: status.name })),
      planVisibilities: Object.values(PlanVisibility),
      geography: departments.map((department) => ({
        country: department.city?.country?.name ?? null,
        city: department.city?.name ?? null,
        department: department.name,
      })),
      // Code-defined vocabularies (validated by the catalog import).
      activityTypes: Object.keys(ACTIVITY_SUBTYPES),
      priceKinds: PRICE_KINDS,
      priceUnits: PRICE_UNITS,
      priceSources: PRICE_SOURCES.filter(
        (s) => s === 'OFFICIAL' || s === 'CURATED',
      ),
      licenseClasses: PROMOTABLE_LICENSE_CLASSES,
    };
  }
}
