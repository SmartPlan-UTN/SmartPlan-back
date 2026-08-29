import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  FindOptionsWhere,
  In,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { ActivityCategory } from '../activities/entities/activity-category.entity';
import { Activity } from '../activities/entities/activity.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { AuditService } from '../common/audit/audit.service';
import { Category } from '../categories/entities/category.entity';
import {
  createPaginatedResponse,
  PaginatedResponse,
} from '../common/pagination/paginated-response';
import { PlanDetail } from '../plans/entities/plan-detail.entity';
import { PlanStatus } from '../plans/entities/plan-status.entity';
import { Plan, PlanVisibility } from '../plans/entities/plan.entity';
import {
  Rating,
  RatingModerationStatus,
} from '../ratings/entities/rating.entity';
import { UserStatus } from '../users/entities/user-status.entity';
import { Role } from '../users/entities/role.entity';
import { User } from '../users/entities/user.entity';
import {
  AdminActivitySortField,
  AdminPlanSortField,
  AdminUserSortField,
  ListAdminActivitiesQueryDto,
  ListAdminPlansQueryDto,
  ListAdminUsersQueryDto,
  PlanStatusKey,
  UserStatusKey,
} from './dto/admin-list-query.dto';
import {
  AdministrationMetricsDto,
  AdminActivityDto,
  AdminPlanDto,
  AdminUserDto,
} from './dto/administration-response.dto';
import {
  CreateAdminActivityDto,
  UpdateAdminActivityDto,
} from './dto/manage-activity.dto';
import { UpdateAdminPlanDto } from './dto/manage-plan.dto';
import { ChangeUserStatusDto, UpdateAdminUserDto } from './dto/manage-user.dto';
import { MetricsQueryDto, MetricsRange } from './dto/metrics-query.dto';
import { AuditAction, AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AdministrationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Activity)
    private readonly activities: Repository<Activity>,
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    @InjectRepository(Rating) private readonly ratings: Repository<Rating>,
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
    private readonly auditService: AuditService,
  ) {}

  async listUsers(
    query: ListAdminUsersQueryDto,
  ): Promise<PaginatedResponse<AdminUserDto>> {
    const builder = this.users
      .createQueryBuilder('user')
      .innerJoinAndSelect('user.role', 'role')
      .innerJoinAndSelect('user.status', 'status');
    if (query.search) {
      builder.andWhere(
        `(user.name ILIKE :search OR user.lastName ILIKE :search
          OR user.email ILIKE :search)`,
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      builder.andWhere('status.key = :status', { status: query.status });
    }
    this.applyUserOrdering(builder, query);
    const [users, total] = await builder
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return createPaginatedResponse(
      users.map((user) => this.toAdminUser(user)),
      total,
      query.page,
      query.limit,
    );
  }

  async changeUserStatus(
    actorId: number,
    id: number,
    dto: ChangeUserStatusDto,
  ): Promise<AdminUserDto> {
    if (actorId === id && dto.status !== UserStatusKey.ACTIVE) {
      throw new ConflictException({
        code: 'ADMIN_SELF_STATUS_CHANGE',
        message: 'Administrators cannot suspend or ban their own account',
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id },
        relations: { role: true, status: true },
      });
      if (!user)
        this.throwNotFound('USER_NOT_FOUND', 'The user does not exist');
      const status = await this.requireCatalog(manager, UserStatus, dto.status);
      const previousStatus = user.status.key;
      user.idUserStatus = status.id;
      user.status = status;
      await manager.save(user);
      if (dto.status !== UserStatusKey.ACTIVE) {
        await manager.update(
          UserSession,
          { idUser: id, active: true },
          { active: false },
        );
      }
      await this.auditService.record(manager, AuditAction.Update, 'user', id, {
        status: { from: previousStatus, to: dto.status },
      });
      return this.toAdminUser(user);
    });
  }

  async updateUser(
    actorId: number,
    id: number,
    dto: UpdateAdminUserDto,
  ): Promise<AdminUserDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException({
        code: 'EMPTY_UPDATE',
        message: 'At least one user field is required',
      });
    }
    if (actorId === id && dto.status && dto.status !== UserStatusKey.ACTIVE) {
      throw new ConflictException({
        code: 'ADMIN_SELF_STATUS_CHANGE',
        message: 'Administrators cannot suspend or ban their own account',
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id },
        relations: { role: true, status: true },
      });
      if (!user)
        this.throwNotFound('USER_NOT_FOUND', 'The user does not exist');

      if (dto.email && dto.email !== user.email) {
        const emailOwner = await manager.findOne(User, {
          where: { email: dto.email },
        });
        if (emailOwner && emailOwner.id !== id) {
          throw new ConflictException({
            code: 'EMAIL_ALREADY_REGISTERED',
            message: 'The email is already registered',
          });
        }
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const assign = <K extends 'name' | 'lastName' | 'email'>(
        field: K,
        value: User[K] | undefined,
      ) => {
        if (value !== undefined && value !== user[field]) {
          changes[field] = { from: user[field], to: value };
          user[field] = value;
        }
      };
      assign('name', dto.name);
      assign('lastName', dto.lastName);
      assign('email', dto.email);

      if (dto.role && dto.role !== user.role.key) {
        const role = await this.requireCatalog(manager, Role, dto.role);
        changes.role = { from: user.role.key, to: dto.role };
        user.idRole = role.id;
        user.role = role;
      }
      if (dto.status && dto.status !== (user.status.key as UserStatusKey)) {
        const status = await this.requireCatalog(
          manager,
          UserStatus,
          dto.status,
        );
        changes.status = { from: user.status.key, to: dto.status };
        user.idUserStatus = status.id;
        user.status = status;
        if (dto.status !== UserStatusKey.ACTIVE) {
          await manager.update(
            UserSession,
            { idUser: id, active: true },
            { active: false },
          );
        }
      }

      if (Object.keys(changes).length === 0) return this.toAdminUser(user);
      await manager.save(user);
      await this.auditService.record(
        manager,
        AuditAction.Update,
        'user',
        id,
        changes,
      );
      return this.toAdminUser(user);
    });
  }

  async listActivities(
    query: ListAdminActivitiesQueryDto,
  ): Promise<PaginatedResponse<AdminActivityDto>> {
    const filtered = () => {
      const builder = this.activities
        .createQueryBuilder('activity')
        .leftJoin('activity.categories', 'activityCategory');
      if (query.search) {
        builder.andWhere(
          '(activity.name ILIKE :search OR activity.description ILIKE :search)',
          { search: `%${query.search}%` },
        );
      }
      if (query.type) {
        builder.andWhere('activity.type = :type', { type: query.type });
      }
      if (query.categoryId) {
        builder.andWhere('activityCategory.idCategory = :categoryId', {
          categoryId: query.categoryId,
        });
      }
      return builder;
    };
    const { count: total } = await filtered()
      .select('COUNT(DISTINCT activity.id)', 'count')
      .getRawOne<{ count: string }>()
      .then((row) => ({ count: Number(row?.count ?? 0) }));
    const idsBuilder = filtered()
      .select('activity.id', 'id')
      .groupBy('activity.id');
    this.applyActivityOrdering(idsBuilder, query);
    const idRows = await idsBuilder
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<{ id: string }>();
    const ids = idRows.map((row) => Number(row.id));
    const activities = ids.length
      ? await this.activities.find({
          where: { id: In(ids) },
          relations: { categories: { category: true } },
        })
      : [];
    const byId = new Map(activities.map((activity) => [activity.id, activity]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((activity): activity is Activity => activity !== undefined);
    return createPaginatedResponse(
      ordered.map((activity) => this.toAdminActivity(activity)),
      total,
      query.page,
      query.limit,
    );
  }

  async createActivity(dto: CreateAdminActivityDto): Promise<AdminActivityDto> {
    return this.dataSource.transaction(async (manager) => {
      await this.requireCategories(manager, dto.categoryIds);
      const activity = await manager.save(
        manager.create(Activity, {
          name: dto.name,
          description: dto.description,
          estimatedCost: dto.estimatedCost,
          estimatedDuration: dto.estimatedDuration,
          type: dto.type ?? null,
        }),
      );
      await this.replaceActivityCategories(
        manager,
        activity.id,
        dto.categoryIds,
      );
      await this.auditService.record(
        manager,
        AuditAction.Create,
        'activity',
        activity.id,
        { name: activity.name },
      );
      return this.findAdminActivity(manager, activity.id);
    });
  }

  async updateActivity(
    id: number,
    dto: UpdateAdminActivityDto,
  ): Promise<AdminActivityDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException({
        code: 'ACTIVITY_UPDATE_EMPTY',
        message: 'At least one activity field must be provided',
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const activity = await manager.findOne(Activity, { where: { id } });
      if (!activity) {
        this.throwNotFound(
          'ACTIVITY_NOT_FOUND',
          'The requested activity does not exist',
        );
      }
      const original = {
        name: activity.name,
        description: activity.description,
        estimatedCost: activity.estimatedCost,
        estimatedDuration: activity.estimatedDuration,
        type: activity.type,
      };
      if (dto.name !== undefined) activity.name = dto.name;
      if (dto.description !== undefined) activity.description = dto.description;
      if (dto.estimatedCost !== undefined)
        activity.estimatedCost = dto.estimatedCost;
      if (dto.estimatedDuration !== undefined)
        activity.estimatedDuration = dto.estimatedDuration;
      if (dto.type !== undefined) activity.type = dto.type;
      if (dto.categoryIds !== undefined) {
        await this.requireCategories(manager, dto.categoryIds);
        await this.replaceActivityCategories(manager, id, dto.categoryIds);
      }
      await manager.save(activity);
      await this.auditService.record(
        manager,
        AuditAction.Update,
        'activity',
        id,
        {
          original,
          current: {
            name: activity.name,
            description: activity.description,
            estimatedCost: activity.estimatedCost,
            estimatedDuration: activity.estimatedDuration,
            type: activity.type,
          },
        },
      );
      return this.findAdminActivity(manager, id);
    });
  }

  async removeActivity(id: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const activity = await manager.findOne(Activity, { where: { id } });
      if (!activity) {
        this.throwNotFound(
          'ACTIVITY_NOT_FOUND',
          'The requested activity does not exist',
        );
      }
      const categories = await manager.find(ActivityCategory, {
        where: { idActivity: id },
      });
      if (categories.length) await manager.softRemove(categories);
      await manager.softRemove(activity);
      await this.auditService.record(
        manager,
        AuditAction.Delete,
        'activity',
        id,
        null,
      );
    });
  }

  async listPlans(
    query: ListAdminPlansQueryDto,
  ): Promise<PaginatedResponse<AdminPlanDto>> {
    const filtered = () => {
      const builder = this.plans
        .createQueryBuilder('plan')
        .innerJoin('plan.user', 'user')
        .innerJoin('plan.status', 'status')
        .leftJoin('plan.details', 'details');
      if (query.search) {
        builder.andWhere(
          `(plan.title ILIKE :search OR plan.description ILIKE :search
            OR user.name ILIKE :search OR user.lastName ILIKE :search
            OR user.email ILIKE :search)`,
          { search: `%${query.search}%` },
        );
      }
      if (query.status) {
        builder.andWhere('status.key = :status', { status: query.status });
      }
      return builder;
    };
    const { count: total } = await filtered()
      .select('COUNT(DISTINCT plan.id)', 'count')
      .getRawOne<{ count: string }>()
      .then((row) => ({ count: Number(row?.count ?? 0) }));
    const idsBuilder = filtered()
      .select('plan.id', 'id')
      .groupBy('plan.id')
      .addGroupBy('status.id');
    this.applyPlanOrdering(idsBuilder, query);
    const idRows = await idsBuilder
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<{ id: string }>();
    const ids = idRows.map((row) => Number(row.id));
    const plans = ids.length
      ? await this.plans.find({
          where: { id: In(ids) },
          relations: { user: true, status: true, details: true },
        })
      : [];
    const byId = new Map(plans.map((plan) => [plan.id, plan]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((plan): plan is Plan => plan !== undefined);
    return createPaginatedResponse(
      ordered.map((plan) => this.toAdminPlan(plan)),
      total,
      query.page,
      query.limit,
    );
  }

  async updatePlan(id: number, dto: UpdateAdminPlanDto): Promise<AdminPlanDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException({
        code: 'PLAN_UPDATE_EMPTY',
        message: 'At least one plan field must be provided',
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const plan = await manager.findOne(Plan, {
        where: { id },
        relations: { user: true, status: true, details: true },
      });
      if (!plan) {
        this.throwNotFound(
          'PLAN_NOT_FOUND',
          'The requested plan does not exist',
        );
      }
      const original = {
        title: plan.title,
        description: plan.description,
        peopleCount: plan.peopleCount,
        status: plan.status.key,
      };
      if (dto.title !== undefined) plan.title = dto.title;
      if (dto.description !== undefined) plan.description = dto.description;
      if (dto.peopleCount !== undefined) plan.peopleCount = dto.peopleCount;
      if (dto.status !== undefined) {
        const status = await this.requireCatalog(
          manager,
          PlanStatus,
          dto.status,
        );
        plan.idPlanStatus = status.id;
        plan.status = status;
        if (status.key === 'completed') {
          plan.completedAt ??= new Date();
          // A completed AI-generated plan joins the recommendation pool
          // (CU20). Manually created plans (CU24) stay private.
          if (plan.idPlanRequest !== null) {
            plan.visibility = PlanVisibility.Public;
          }
        }
      }
      await manager.save(plan);
      await this.auditService.record(manager, AuditAction.Update, 'plan', id, {
        original,
        current: {
          title: plan.title,
          description: plan.description,
          peopleCount: plan.peopleCount,
          status: plan.status.key,
        },
      });
      return this.toAdminPlan(plan);
    });
  }

  async removePlan(id: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const plan = await manager.findOne(Plan, { where: { id } });
      if (!plan) {
        this.throwNotFound(
          'PLAN_NOT_FOUND',
          'The requested plan does not exist',
        );
      }
      const details = await manager.find(PlanDetail, { where: { idPlan: id } });
      if (details.length) await manager.softRemove(details);
      await manager.softRemove(plan);
      await this.auditService.record(
        manager,
        AuditAction.Delete,
        'plan',
        id,
        null,
      );
    });
  }

  async metrics(query: MetricsQueryDto): Promise<AdministrationMetricsDto> {
    const to = new Date();
    const from = this.rangeStart(query.range, to);
    const [
      totalUsers,
      activePlans,
      catalogActivities,
      pendingRatings,
      moderationCounts,
      averageRating,
      retainedUsers,
      moods,
      groupSizes,
      popularActivities,
      recentActivity,
    ] = await Promise.all([
      this.users.count(),
      this.plans
        .createQueryBuilder('plan')
        .innerJoin('plan.status', 'status')
        .where('status.key != :cancelled', {
          cancelled: PlanStatusKey.CANCELLED,
        })
        .getCount(),
      this.activities.count(),
      this.ratings.count({
        where: { moderationStatus: RatingModerationStatus.Pending },
      }),
      this.moderationCounts(from, to),
      this.approvedAverage(from, to),
      this.retainedUsers(from, to),
      this.moodDistribution(from, to),
      this.groupSizeDistribution(from, to),
      this.popularActivities(from, to),
      this.recentActivity(from, to),
    ]);
    const moderationTotal =
      moderationCounts.approved + moderationCounts.rejected;
    return {
      range: { key: query.range, from, to },
      kpis: { totalUsers, activePlans, catalogActivities, pendingRatings },
      acceptanceRate: this.percentage(
        moderationCounts.approved,
        moderationTotal,
      ),
      averageRating,
      retentionRate: this.percentage(retainedUsers, totalUsers),
      distributions: {
        moods: this.withPercentages(moods),
        groupSizes: this.withPercentages(groupSizes),
      },
      popularActivities,
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        affectedEntity: entry.affectedEntity,
        affectedEntityId: entry.affectedEntityId,
        label: entry.label,
        createdAt: entry.createdAt,
      })),
    };
  }

  private applyUserOrdering(
    builder: SelectQueryBuilder<User>,
    query: ListAdminUsersQueryDto,
  ): void {
    const columns: Record<AdminUserSortField, string> = {
      [AdminUserSortField.CREATED_AT]: 'user.createdAt',
      [AdminUserSortField.NAME]: 'user.name',
      [AdminUserSortField.EMAIL]: 'user.email',
      [AdminUserSortField.ROLE]: 'role.key',
      [AdminUserSortField.STATUS]: 'status.key',
    };
    const field = query.sortBy ?? AdminUserSortField.CREATED_AT;
    builder
      .orderBy(columns[field], query.direction.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('user.id', 'ASC');
  }

  private applyActivityOrdering(
    builder: SelectQueryBuilder<Activity>,
    query: ListAdminActivitiesQueryDto,
  ): void {
    const columns: Record<AdminActivitySortField, string> = {
      [AdminActivitySortField.CREATED_AT]: 'activity.createdAt',
      [AdminActivitySortField.NAME]: 'activity.name',
      [AdminActivitySortField.PRICE]: 'activity.estimatedCost',
    };
    const field = query.sortBy ?? AdminActivitySortField.CREATED_AT;
    builder
      .orderBy(columns[field], query.direction.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('activity.id', 'ASC');
  }

  private applyPlanOrdering(
    builder: SelectQueryBuilder<Plan>,
    query: ListAdminPlansQueryDto,
  ): void {
    const columns: Record<AdminPlanSortField, string> = {
      [AdminPlanSortField.CREATED_AT]: 'plan.createdAt',
      [AdminPlanSortField.TITLE]: 'plan.title',
      [AdminPlanSortField.STATUS]: 'status.key',
      [AdminPlanSortField.COST]: 'plan.estimatedTotalCost',
    };
    const field = query.sortBy ?? AdminPlanSortField.CREATED_AT;
    builder
      .orderBy(columns[field], query.direction.toUpperCase() as 'ASC' | 'DESC')
      .addOrderBy('plan.id', 'ASC');
  }

  private async requireCategories(
    manager: EntityManager,
    ids: number[],
  ): Promise<void> {
    if (ids.length === 0) return;
    const count = await manager.count(Category, { where: { id: In(ids) } });
    if (count !== ids.length) {
      this.throwNotFound(
        'CATEGORY_NOT_FOUND',
        'At least one selected category does not exist',
      );
    }
  }

  private async replaceActivityCategories(
    manager: EntityManager,
    activityId: number,
    categoryIds: number[],
  ): Promise<void> {
    const current = await manager.find(ActivityCategory, {
      where: { idActivity: activityId },
    });
    if (current.length) await manager.softRemove(current);
    if (categoryIds.length) {
      await manager.save(
        categoryIds.map((categoryId) =>
          manager.create(ActivityCategory, {
            idActivity: activityId,
            idCategory: categoryId,
          }),
        ),
      );
    }
  }

  private async findAdminActivity(
    manager: EntityManager,
    id: number,
  ): Promise<AdminActivityDto> {
    const activity = await manager.findOne(Activity, {
      where: { id },
      relations: { categories: { category: true } },
    });
    if (!activity) {
      this.throwNotFound(
        'ACTIVITY_NOT_FOUND',
        'The requested activity does not exist',
      );
    }
    return this.toAdminActivity(activity);
  }

  private async requireCatalog<T extends UserStatus | PlanStatus | Role>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    key: string,
  ): Promise<T> {
    const value = await manager.findOne(entity, {
      where: { key } as FindOptionsWhere<T>,
    });
    if (!value) {
      this.throwNotFound(
        'STATUS_NOT_AVAILABLE',
        'The requested status is not available',
      );
    }
    return value;
  }

  private toAdminUser(user: User): AdminUserDto {
    return {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      role: { key: user.role.key, name: user.role.name },
      status: {
        key: user.status.key as UserStatusKey,
        name: user.status.name,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toAdminActivity(activity: Activity): AdminActivityDto {
    return {
      id: activity.id,
      name: activity.name,
      description: activity.description,
      estimatedCost: activity.estimatedCost,
      estimatedDuration: activity.estimatedDuration,
      type: activity.type,
      categories: (activity.categories ?? [])
        .map(({ category }) => ({ id: category.id, name: category.name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      createdAt: activity.createdAt,
      updatedAt: activity.updatedAt,
    };
  }

  private toAdminPlan(plan: Plan): AdminPlanDto {
    return {
      id: plan.id,
      title: plan.title,
      description: plan.description,
      estimatedTotalCost: plan.estimatedTotalCost,
      estimatedTotalDuration: plan.estimatedTotalDuration,
      peopleCount: plan.peopleCount,
      activityCount: plan.details?.length ?? 0,
      owner: {
        id: plan.user.id,
        name: plan.user.name,
        lastName: plan.user.lastName,
        email: plan.user.email,
      },
      status: {
        key: plan.status.key as PlanStatusKey,
        name: plan.status.name,
      },
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    };
  }

  private rangeStart(range: MetricsRange, now: Date): Date {
    const start = new Date(now);
    if (range === MetricsRange.TODAY) start.setHours(0, 0, 0, 0);
    if (range === MetricsRange.SEVEN_DAYS) start.setDate(start.getDate() - 7);
    if (range === MetricsRange.THIRTY_DAYS) start.setDate(start.getDate() - 30);
    if (range === MetricsRange.CURRENT_MONTH) {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }
    return start;
  }

  private async moderationCounts(
    from: Date,
    to: Date,
  ): Promise<{ approved: number; rejected: number }> {
    const rows = await this.ratings
      .createQueryBuilder('rating')
      .select('rating.moderationStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('rating.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere('rating.moderationStatus IN (:...statuses)', {
        statuses: [
          RatingModerationStatus.Approved,
          RatingModerationStatus.Rejected,
        ],
      })
      .groupBy('rating.moderationStatus')
      .getRawMany<{ status: RatingModerationStatus; count: string }>();
    return {
      approved: Number(
        rows.find((row) => row.status === RatingModerationStatus.Approved)
          ?.count ?? 0,
      ),
      rejected: Number(
        rows.find((row) => row.status === RatingModerationStatus.Rejected)
          ?.count ?? 0,
      ),
    };
  }

  private async approvedAverage(from: Date, to: Date): Promise<number> {
    const row = await this.ratings
      .createQueryBuilder('rating')
      .select('COALESCE(AVG(rating.score), 0)', 'average')
      .where('rating.createdAt BETWEEN :from AND :to', { from, to })
      .andWhere('rating.moderationStatus = :status', {
        status: RatingModerationStatus.Approved,
      })
      .getRawOne<{ average: string }>();
    return this.round(Number(row?.average ?? 0));
  }

  private async retainedUsers(from: Date, to: Date): Promise<number> {
    const row = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .from(
        (subquery) =>
          subquery
            .select('retained.id_user', 'id_user')
            .from(Plan, 'retained')
            .where('retained.created_at BETWEEN :from AND :to', { from, to })
            .andWhere('retained.deleted_at IS NULL')
            .groupBy('retained.id_user')
            .having('COUNT(retained.id) >= 2'),
        'returning_users',
      )
      .setParameters({ from, to })
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  private async moodDistribution(
    from: Date,
    to: Date,
  ): Promise<Array<{ key: string; name: string; count: number }>> {
    const rows = await this.plans
      .createQueryBuilder('plan')
      .innerJoin('plan.request', 'request')
      .innerJoin('request.outingType', 'outingType')
      .select('outingType.key', 'key')
      .addSelect('outingType.name', 'name')
      .addSelect('COUNT(plan.id)', 'count')
      .where('plan.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy('outingType.key')
      .addGroupBy('outingType.name')
      .orderBy('COUNT(plan.id)', 'DESC')
      .getRawMany<{ key: string; name: string; count: string }>();
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  private async groupSizeDistribution(
    from: Date,
    to: Date,
  ): Promise<Array<{ key: string; name: string; count: number }>> {
    const rows = await this.plans
      .createQueryBuilder('plan')
      .select(
        `CASE
          WHEN plan.peopleCount <= 2 THEN 'couple'
          WHEN plan.peopleCount <= 5 THEN 'small-group'
          ELSE 'large-group'
        END`,
        'key',
      )
      .addSelect(
        `CASE
          WHEN plan.peopleCount <= 2 THEN 'Couple'
          WHEN plan.peopleCount <= 5 THEN 'Small group'
          ELSE 'Large group'
        END`,
        'name',
      )
      .addSelect('COUNT(plan.id)', 'count')
      .where('plan.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy('key')
      .addGroupBy('name')
      .orderBy('COUNT(plan.id)', 'DESC')
      .getRawMany<{ key: string; name: string; count: string }>();
    return rows.map((row) => ({ ...row, count: Number(row.count) }));
  }

  private async popularActivities(
    from: Date,
    to: Date,
  ): Promise<Array<{ id: number; name: string; planCount: number }>> {
    const rows = await this.dataSource
      .getRepository(PlanDetail)
      .createQueryBuilder('detail')
      .innerJoin('detail.plan', 'plan')
      .innerJoin('detail.activity', 'activity')
      .select('activity.id', 'id')
      .addSelect('activity.name', 'name')
      .addSelect('COUNT(DISTINCT plan.id)', 'planCount')
      .where('plan.createdAt BETWEEN :from AND :to', { from, to })
      .groupBy('activity.id')
      .addGroupBy('activity.name')
      .orderBy('COUNT(DISTINCT plan.id)', 'DESC')
      .addOrderBy('activity.id', 'ASC')
      .take(5)
      .getRawMany<{ id: string; name: string; planCount: string }>();
    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      planCount: Number(row.planCount),
    }));
  }

  private async recentActivity(
    from: Date,
    to: Date,
  ): Promise<Array<AuditLog & { label: string }>> {
    const entries = await this.auditLogs
      .createQueryBuilder('audit')
      .where('audit.createdAt BETWEEN :from AND :to', { from, to })
      .orderBy('audit.createdAt', 'DESC')
      .addOrderBy('audit.id', 'DESC')
      .take(10)
      .getMany();
    const labels = await this.resolveRecentActivityLabels(entries);
    return entries.map((entry) => ({
      ...entry,
      label:
        labels.get(entry.id) ??
        `${entry.affectedEntity} #${entry.affectedEntityId}`,
    }));
  }

  /**
   * Resolves a human-readable label per audit entry (the affected user's
   * name, activity name, or plan title) so `recentActivity` doesn't force
   * the frontend to look up each entity by id. Looked up `withDeleted`
   * since soft-deleted records (e.g. a removed activity) still need a
   * label. Batched per entity type to avoid one query per row.
   */
  private async resolveRecentActivityLabels(
    entries: AuditLog[],
  ): Promise<Map<number, string>> {
    const idsByEntity = new Map<string, number[]>();
    for (const entry of entries) {
      const ids = idsByEntity.get(entry.affectedEntity) ?? [];
      ids.push(entry.affectedEntityId);
      idsByEntity.set(entry.affectedEntity, ids);
    }

    const labels = new Map<number, string>();
    const assign = (entity: string, byId: Map<number, string>) => {
      for (const entry of entries) {
        if (entry.affectedEntity !== entity) continue;
        const label = byId.get(entry.affectedEntityId);
        if (label) labels.set(entry.id, label);
      }
    };

    const userIds = idsByEntity.get('user');
    if (userIds?.length) {
      const users = await this.users.find({
        where: { id: In(userIds) },
        withDeleted: true,
      });
      assign(
        'user',
        new Map(
          users.map((user) => [user.id, `${user.name} ${user.lastName}`]),
        ),
      );
    }

    const activityIds = idsByEntity.get('activity');
    if (activityIds?.length) {
      const activities = await this.activities.find({
        where: { id: In(activityIds) },
        withDeleted: true,
      });
      assign('activity', new Map(activities.map((a) => [a.id, a.name])));
    }

    const planIds = idsByEntity.get('plan');
    if (planIds?.length) {
      const plans = await this.plans.find({
        where: { id: In(planIds) },
        withDeleted: true,
      });
      assign('plan', new Map(plans.map((plan) => [plan.id, plan.title])));
    }

    return labels;
  }

  private withPercentages(
    values: Array<{ key: string; name: string; count: number }>,
  ): Array<{ key: string; name: string; count: number; percentage: number }> {
    const total = values.reduce((sum, value) => sum + value.count, 0);
    return values.map((value) => ({
      ...value,
      percentage: this.percentage(value.count, total),
    }));
  }

  private percentage(value: number, total: number): number {
    return total === 0 ? 0 : this.round((value / total) * 100);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private throwNotFound(code: string, message: string): never {
    throw new NotFoundException({ code, message });
  }
}
