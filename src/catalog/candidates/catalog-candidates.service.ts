import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { Activity } from '../../activities/entities/activity.entity';
import { ActivityPlace } from '../../activities/entities/activity-place.entity';
import { AuditAction } from '../../administration/entities/audit-log.entity';
import { AuditService } from '../../common/audit/audit.service';
import { createPaginatedResponse } from '../../common/pagination/paginated-response';
import { Place } from '../../places/entities/place.entity';
import {
  CATALOG_PACKAGE_SCHEMA_VERSION,
  validateActivityRecord,
  validatePlaceRecord,
  type ActivityRecord,
  type PlaceRecord,
} from '../catalog-package';
import {
  DUPLICATE_NAME_SIMILARITY,
  nameSimilarity,
  normalizeName,
} from '../catalog-dedupe';
import { CatalogImportService } from '../catalog-import.service';
import {
  CANDIDATE_ORIGINS,
  CANDIDATE_STATUSES,
  CatalogCandidate,
  type CandidateEntityType,
  type CandidateOrigin,
  type CandidateSourceRef,
} from '../entities/catalog-candidate.entity';
import type {
  BulkApproveResultDto,
  CatalogCandidateCountsDto,
  CatalogCandidateDetailDto,
  CatalogCandidateSummaryDto,
  ListCatalogCandidatesQueryDto,
  UpdateCatalogCandidateDto,
} from './dto/catalog-candidate.dto';

/** The source an approved candidate enters the catalog under. */
export const CANDIDATE_CATALOG_SOURCE = 'catalog-candidate';

/** sha256(entity type | place slug | normalised name): one proposal, once. */
export function candidateFingerprint(
  entityType: CandidateEntityType,
  placeSlug: string | null,
  name: string,
): string {
  return createHash('sha256')
    .update(`${entityType}|${placeSlug ?? ''}|${normalizeName(name)}`)
    .digest('hex');
}

/** Package validation codes, reported on the field a reviewer can fix. */
const FIELD_OF_CODE: Array<[RegExp, string]> = [
  [/^invalid_slug/, 'slug'],
  [/^invalid_name/, 'name'],
  [/^invalid_description/, 'description'],
  [/^invalid_duration/, 'durationMinutes'],
  [/^missing_categories|^unknown_category/, 'categories'],
  [/^missing_places|^unknown_place/, 'idPlace'],
  [/price/, 'price'],
  [/occasion/, 'occasions'],
  [/people/, 'maxPeople'],
  [/min_age/, 'minAge'],
  [/materials/, 'materials'],
  [/rules_ref/, 'rulesRef'],
  [/times_of_day/, 'availableTimesOfDay'],
  [/activity_type/, 'type'],
  [/address/, 'address'],
  [/geography|department/, 'department'],
  [/coordinates|location/, 'latitude'],
];

function validationError(codes: string[]): BadRequestException {
  const byField = new Map<string, string[]>();
  for (const code of codes) {
    const field =
      FIELD_OF_CODE.find(([pattern]) => pattern.test(code))?.[1] ?? 'payload';
    byField.set(field, [...(byField.get(field) ?? []), code]);
  }
  return new BadRequestException({
    statusCode: 400,
    code: 'VALIDATION_FAILED',
    message: 'The submitted data is invalid',
    errors: [...byField].map(([field, messages]) => ({ field, messages })),
  });
}

export interface ProposedCandidate {
  entityType: CandidateEntityType;
  payload: ActivityRecord | PlaceRecord;
  /** The place an activity candidate belongs to. */
  placeSlug?: string | null;
  sourceRefs?: CandidateSourceRef[];
  notes?: string[];
  model?: string | null;
  idExternalSync?: number | null;
}

export interface ProposeResult {
  created: number;
  /** Same fingerprint as an earlier candidate, in any status. */
  alreadyProposed: number;
  /** Too close to something the catalog already has. */
  inCatalog: number;
  invalid: { name: string; errors: string[] }[];
}

/**
 * The human review queue of proposed activities and places (RF44, CU50).
 * Approving runs the regular catalog import, so a candidate goes through the
 * same validation, dedupe, eligibility and change log as any package.
 */
@Injectable()
export class CatalogCandidatesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly importer: CatalogImportService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListCatalogCandidatesQueryDto) {
    const builder = this.dataSource
      .getRepository(CatalogCandidate)
      .createQueryBuilder('candidate')
      .leftJoinAndSelect('candidate.place', 'place')
      .leftJoinAndSelect('place.department', 'department')
      .where('candidate.deletedAt IS NULL')
      .andWhere('candidate.status = :status', { status: query.status });
    if (query.entityType)
      builder.andWhere('candidate.entityType = :entityType', {
        entityType: query.entityType,
      });
    if (query.origin)
      builder.andWhere('candidate.origin = :origin', { origin: query.origin });
    if (query.idPlace)
      builder.andWhere('candidate.idPlace = :idPlace', {
        idPlace: query.idPlace,
      });
    if (query.idDepartment)
      builder.andWhere(
        `(place.idDepartment = :idDepartment OR (
        candidate.entityType = 'place' AND EXISTS (
          SELECT 1 FROM department proposed_department
          JOIN city proposed_city ON proposed_city.id = proposed_department.id_city
          JOIN country proposed_country ON proposed_country.id = proposed_city.id_country
          WHERE proposed_department.id = :idDepartment
            AND proposed_department.deleted_at IS NULL
            AND proposed_city.deleted_at IS NULL AND proposed_country.deleted_at IS NULL
            AND proposed_department.name = candidate.payload->>'department'
            AND proposed_city.name = candidate.payload->>'city'
            AND proposed_country.name = candidate.payload->>'country'
        )
      ))`,
        {
          idDepartment: query.idDepartment,
        },
      );
    if (query.placeKind)
      builder.andWhere(
        "(place.kind = :placeKind OR candidate.payload->>'kind' = :placeKind OR candidate.payload->>'type' = :placeKind)",
        { placeKind: query.placeKind },
      );
    if (query.search)
      builder.andWhere(
        "(candidate.payload->>'name' ILIKE :search OR place.name ILIKE :search)",
        { search: `%${query.search}%` },
      );
    const direction = query.direction.toUpperCase() as 'ASC' | 'DESC';
    if (query.sortBy === 'placeName')
      builder.orderBy('place.name', direction, 'NULLS LAST');
    else builder.orderBy('candidate.createdAt', direction);
    builder.addOrderBy('candidate.id', 'ASC');

    const [items, total] = await builder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return createPaginatedResponse(
      items.map((candidate) => this.summary(candidate)),
      total,
      query.page,
      query.limit,
    );
  }

  async counts(): Promise<CatalogCandidateCountsDto> {
    const rows = await this.dataSource.query<
      { status: string; origin: string; count: string }[]
    >(
      `SELECT status, origin, count(*) AS count FROM catalog_candidate
       WHERE deleted_at IS NULL GROUP BY status, origin`,
    );
    const byStatus = Object.fromEntries(
      CANDIDATE_STATUSES.map((status) => [status, 0]),
    ) as CatalogCandidateCountsDto['byStatus'];
    const pendingByOrigin = Object.fromEntries(
      CANDIDATE_ORIGINS.map((origin) => [origin, 0]),
    ) as CatalogCandidateCountsDto['pendingByOrigin'];
    for (const row of rows) {
      const count = Number(row.count);
      if (row.status in byStatus)
        byStatus[row.status as keyof typeof byStatus] += count;
      if (row.status === 'pending' && row.origin in pendingByOrigin)
        pendingByOrigin[row.origin as CandidateOrigin] += count;
    }
    return { byStatus, pendingByOrigin };
  }

  async detail(id: number): Promise<CatalogCandidateDetailDto> {
    const candidate = await this.find(this.dataSource.manager, id);
    const existing = candidate.idPlace
      ? await this.dataSource
          .getRepository(Activity)
          .createQueryBuilder('activity')
          .innerJoin(
            ActivityPlace,
            'link',
            'link.idActivity = activity.id AND link.deletedAt IS NULL',
          )
          .where('link.idPlace = :idPlace', { idPlace: candidate.idPlace })
          .andWhere('activity.deletedAt IS NULL')
          .andWhere("activity.status = 'published'")
          .orderBy('activity.name', 'ASC')
          .getMany()
      : [];
    const payload = candidate.payload as unknown as Record<string, unknown>;
    const original = candidate.originalPayload as unknown as Record<
      string,
      unknown
    >;
    return {
      ...this.summary(candidate),
      payload,
      originalPayload: original,
      changedFields: [
        ...new Set([...Object.keys(payload), ...Object.keys(original)]),
      ]
        .filter(
          (key) =>
            JSON.stringify(payload[key]) !== JSON.stringify(original[key]),
        )
        .sort(),
      existingActivities: existing.map((activity) => ({
        id: activity.id,
        slug: activity.slug,
        name: activity.name,
        type: activity.type,
        occasions: activity.occasions ?? [],
      })),
      model: candidate.model,
    };
  }

  async update(
    id: number,
    dto: UpdateCatalogCandidateDto,
    actorId: number,
  ): Promise<CatalogCandidateDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const candidate = await this.find(manager, id, true);
      this.assertPending(candidate);
      const payload = { ...candidate.payload } as Record<string, unknown>;
      const editable =
        candidate.entityType === 'activity'
          ? ([
              'name',
              'description',
              'durationMinutes',
              'type',
              'categories',
              'price',
              'occasions',
              'minPeople',
              'maxPeople',
              'minAge',
              'materials',
            ] as const)
          : (['name', 'description'] as const);
      // The validation pipe builds the DTO with every property present, so
      // only a value that was actually sent counts (null clears a field).
      for (const key of editable) {
        const value = (dto as Record<string, unknown>)[key];
        if (value !== undefined) payload[key] = value;
      }

      if (dto.idPlace !== undefined) {
        if (candidate.entityType !== 'activity')
          throw validationError(['unknown_place']);
        const place = await manager.findOne(Place, {
          where: { id: dto.idPlace },
        });
        if (!place?.slug || place.status === 'archived')
          throw validationError(['unknown_place']);
        payload.places = [place.slug];
        candidate.idPlace = place.id;
      }

      const validation =
        candidate.entityType === 'activity'
          ? validateActivityRecord(payload)
          : validatePlaceRecord(payload);
      if (!validation.value) throw validationError(validation.errors);
      candidate.payload = validation.value;
      await manager.save(candidate);
      await this.audit.record(
        manager,
        AuditAction.Update,
        'catalog_candidate',
        candidate.id,
        {
          edited: Object.keys(dto).filter(
            (key) => (dto as Record<string, unknown>)[key] !== undefined,
          ),
        },
        actorId,
      );
    });
    return this.detail(id);
  }

  async approve(
    id: number,
    actorId: number,
    force = false,
  ): Promise<{ id: number; appliedEntityId: number | null }> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const candidate = await this.find(manager, id, true);
      this.assertPending(candidate);
      const isActivity = candidate.entityType === 'activity';
      if (isActivity) {
        const payload = candidate.payload as ActivityRecord;
        // Serialize approvals at every proposed venue. A second reviewer
        // sees the first approval before checking the current catalog.
        for (const slug of [...new Set(payload.places)].sort())
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
            `catalog-candidate-place:${slug}`,
          ]);
        if (!force) {
          const existing = await manager.query<
            { slug: string; name: string }[]
          >(
            `SELECT DISTINCT a.slug, a.name FROM activity a
             JOIN activity_place ap ON ap.id_activity = a.id AND ap.deleted_at IS NULL
             JOIN place p ON p.id = ap.id_place AND p.deleted_at IS NULL
             WHERE p.slug = ANY($1) AND a.deleted_at IS NULL AND a.status <> 'archived'`,
            [payload.places],
          );
          const notes = existing
            .filter(
              (row) =>
                nameSimilarity(row.name, payload.name) >=
                DUPLICATE_NAME_SIMILARITY,
            )
            .map((row) => `possible_duplicate_of:${row.slug}`);
          if (notes.length) {
            candidate.notes = [...new Set([...candidate.notes, ...notes])];
            await manager.save(candidate);
            return { kind: 'duplicate' as const, notes };
          }
        }
      }
      const report = await this.importer.import(
        {
          schemaVersion: CATALOG_PACKAGE_SCHEMA_VERSION,
          source: CANDIDATE_CATALOG_SOURCE,
          licenseClass: 'OWNED',
          places: isActivity ? [] : [candidate.payload],
          activities: isActivity ? [candidate.payload] : [],
        },
        // One transaction: the catalog write and the reviewed candidate.
        { acceptDuplicates: force, manager },
      );
      const record = report.records.find(
        (entry) =>
          entry.type === candidate.entityType &&
          entry.slug === candidate.payload.slug,
      );
      if (!record || record.status === 'rejected')
        return { kind: 'invalid' as const, notes: record?.notes ?? [] };
      if (record.status === 'needs_review') {
        candidate.notes = [...new Set([...candidate.notes, ...record.notes])];
        await manager.save(candidate);
        return { kind: 'duplicate' as const, notes: record.notes };
      }
      const applied = isActivity
        ? await manager.findOne(Activity, {
            where: { slug: candidate.payload.slug },
          })
        : await manager.findOne(Place, {
            where: { slug: candidate.payload.slug },
          });
      candidate.status = 'approved';
      candidate.reviewedBy = actorId;
      candidate.reviewedAt = new Date();
      candidate.appliedEntityId = applied?.id ?? null;
      await manager.save(candidate);
      await this.audit.record(
        manager,
        AuditAction.Update,
        'catalog_candidate',
        candidate.id,
        { decision: 'approve', force, appliedEntityId: applied?.id ?? null },
        actorId,
      );
      return {
        kind: 'approved' as const,
        appliedEntityId: applied?.id ?? null,
      };
    });

    if (outcome.kind === 'invalid') throw validationError(outcome.notes);
    if (outcome.kind === 'duplicate')
      throw new ConflictException({
        statusCode: 409,
        code: 'CANDIDATE_POSSIBLE_DUPLICATE',
        message:
          'The catalog already has something very similar; approve with force to accept it anyway',
        duplicates: outcome.notes
          .filter((note) => note.startsWith('possible_duplicate_of:'))
          .map((note) => note.slice('possible_duplicate_of:'.length)),
      });
    return { id, appliedEntityId: outcome.appliedEntityId };
  }

  async discard(id: number, reason: string, actorId: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const candidate = await this.find(manager, id, true);
      this.assertPending(candidate);
      candidate.status = 'discarded';
      candidate.discardReason = reason;
      candidate.reviewedBy = actorId;
      candidate.reviewedAt = new Date();
      await manager.save(candidate);
      await this.audit.record(
        manager,
        AuditAction.Update,
        'catalog_candidate',
        candidate.id,
        { decision: 'discard', reason },
        actorId,
      );
    });
  }

  /** Approves several candidates of one place, reporting each one. */
  async bulkApprove(
    ids: number[],
    actorId: number,
    force = false,
  ): Promise<BulkApproveResultDto> {
    const candidates = await this.dataSource
      .getRepository(CatalogCandidate)
      .find({ where: { id: In(ids) } });
    if (candidates.length !== ids.length)
      throw new NotFoundException({
        code: 'CATALOG_CANDIDATE_NOT_FOUND',
        message: 'Some candidates do not exist',
      });
    const places = new Set(candidates.map((candidate) => candidate.idPlace));
    if (places.size > 1 || candidates.some((c) => c.entityType !== 'activity'))
      throw new BadRequestException({
        statusCode: 400,
        code: 'CANDIDATE_BULK_MIXED_PLACES',
        message: 'A bulk approval takes activities of a single place',
      });

    const results: BulkApproveResultDto['results'] = [];
    for (const id of ids) {
      try {
        const { appliedEntityId } = await this.approve(id, actorId, force);
        results.push({ id, status: 'approved', appliedEntityId });
      } catch (error) {
        const body = (
          error as { getResponse?: () => Record<string, unknown> }
        ).getResponse?.();
        const code = body?.code;
        if (code === 'CANDIDATE_POSSIBLE_DUPLICATE')
          results.push({ id, status: 'possible_duplicate' });
        else if (code === 'CANDIDATE_NOT_PENDING')
          results.push({ id, status: 'not_pending' });
        else if (code === 'VALIDATION_FAILED')
          results.push({
            id,
            status: 'invalid',
            errors: (
              (body?.errors as { messages: string[] }[] | undefined) ?? []
            ).flatMap((entry) => entry.messages),
          });
        else throw error;
      }
    }
    return { results };
  }

  /**
   * Adds proposals to the queue (initial load and monthly refresh). Never
   * publishes anything. A fingerprint seen before, in any status, is
   * skipped, and so is an activity the place already offers.
   */
  async propose(
    items: ProposedCandidate[],
    origin: CandidateOrigin,
  ): Promise<ProposeResult> {
    const result: ProposeResult = {
      created: 0,
      alreadyProposed: 0,
      inCatalog: 0,
      invalid: [],
    };
    for (const item of items) {
      const validation =
        item.entityType === 'activity'
          ? validateActivityRecord(item.payload)
          : validatePlaceRecord(item.payload);
      if (!validation.value) {
        result.invalid.push({
          name:
            typeof (item.payload as { name?: unknown }).name === 'string'
              ? (item.payload as { name: string }).name
              : '',
          errors: validation.errors,
        });
        continue;
      }
      const payload = validation.value;
      const placeSlug =
        item.entityType === 'activity'
          ? (item.placeSlug ?? (payload as ActivityRecord).places[0] ?? null)
          : null;
      const place = placeSlug
        ? await this.dataSource.manager.findOne(Place, {
            where: { slug: placeSlug },
          })
        : null;
      if (item.entityType === 'activity' && !place) {
        result.invalid.push({ name: payload.name, errors: ['unknown_place'] });
        continue;
      }
      if (place && (await this.placeAlreadyOffers(place.id, payload.name))) {
        result.inCatalog += 1;
        continue;
      }
      const inserted = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(CatalogCandidate)
        .values({
          entityType: item.entityType,
          status: 'pending',
          origin,
          idPlace: place?.id ?? null,
          payload,
          originalPayload: payload,
          sourceRefs: item.sourceRefs ?? [],
          notes: item.notes ?? [],
          fingerprint: candidateFingerprint(
            item.entityType,
            placeSlug,
            payload.name,
          ),
          idExternalSync: item.idExternalSync ?? null,
          model: item.model ?? null,
        })
        .orIgnore()
        .execute();
      // ON CONFLICT DO NOTHING returns no row for a fingerprint seen before.
      if (((inserted.raw as unknown[]) ?? []).length > 0) result.created += 1;
      else result.alreadyProposed += 1;
    }
    return result;
  }

  private async placeAlreadyOffers(
    placeId: number,
    name: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<{ name: string }[]>(
      `SELECT a.name FROM activity a
       JOIN activity_place ap ON ap.id_activity = a.id AND ap.deleted_at IS NULL
       WHERE ap.id_place = $1 AND a.deleted_at IS NULL AND a.status <> 'archived'`,
      [placeId],
    );
    return rows.some(
      (row) => nameSimilarity(row.name, name) >= DUPLICATE_NAME_SIMILARITY,
    );
  }

  private async find(
    manager: EntityManager,
    id: number,
    lock = false,
  ): Promise<CatalogCandidate> {
    const candidate = lock
      ? await manager.findOne(CatalogCandidate, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        })
      : await manager.findOne(CatalogCandidate, {
          where: { id },
          relations: { place: { department: true } },
        });
    if (!candidate)
      throw new NotFoundException({
        code: 'CATALOG_CANDIDATE_NOT_FOUND',
        message: 'The catalog candidate does not exist',
      });
    if (lock && candidate.idPlace)
      candidate.place = await manager.findOne(Place, {
        where: { id: candidate.idPlace },
        relations: { department: true },
      });
    return candidate;
  }

  private assertPending(candidate: CatalogCandidate): void {
    if (candidate.status !== 'pending')
      throw new ConflictException({
        statusCode: 409,
        code: 'CANDIDATE_NOT_PENDING',
        message: 'The candidate was already approved or discarded',
      });
  }

  private summary(candidate: CatalogCandidate): CatalogCandidateSummaryDto {
    const payload = candidate.payload as Partial<ActivityRecord> &
      Partial<PlaceRecord> & { name: string };
    return {
      id: candidate.id,
      entityType: candidate.entityType,
      status: candidate.status,
      origin: candidate.origin,
      name: payload.name,
      description: payload.description ?? null,
      place: candidate.place
        ? {
            id: candidate.place.id,
            slug: candidate.place.slug,
            name: candidate.place.name,
            kind: candidate.place.kind,
            departmentName: candidate.place.department?.name ?? null,
          }
        : null,
      price: (payload.price as unknown as Record<string, unknown>) ?? null,
      occasions: payload.occasions ?? [],
      durationMinutes: payload.durationMinutes ?? null,
      minPeople: payload.minPeople ?? null,
      maxPeople: payload.maxPeople ?? null,
      notes: candidate.notes ?? [],
      sourceRefs: candidate.sourceRefs ?? [],
      createdAt: candidate.createdAt,
      reviewedAt: candidate.reviewedAt,
      discardReason: candidate.discardReason,
      appliedEntityId: candidate.appliedEntityId,
    };
  }
}
