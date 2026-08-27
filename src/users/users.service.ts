import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AuditAction } from '../administration/entities/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';
import { Category } from '../categories/entities/category.entity';
import { PasswordRecovery } from '../auth/entities/password-recovery.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { PasswordService } from '../auth/security/password.service';
import { User } from './entities/user.entity';
import { UserPreference } from './entities/user-preference.entity';
import { UserPreferenceProfile } from './entities/user-preference-profile.entity';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import {
  UserPreferenceCategoryDto,
  UserPreferencesResponseDto,
} from './dto/user-preferences-response.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async getProfile(idUser: number): Promise<UserProfileResponseDto> {
    return this.toProfile(await this.findUser(idUser));
  }

  async updateProfile(
    idUser: number,
    dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.findUser(idUser, manager);
      user.name = dto.name;
      user.lastName = dto.lastName;
      await manager.save(user);
      await this.auditService.recordUserAction(
        manager,
        AuditAction.Update,
        idUser,
        {
          name: user.name,
          lastName: user.lastName,
        },
      );
      return this.toProfile(user);
    });
  }

  async changePassword(idUser: number, dto: ChangePasswordDto): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager
        .createQueryBuilder(User, 'user')
        .addSelect('user.passwordHash')
        .setLock('pessimistic_write')
        .where('user.id = :idUser', { idUser })
        .getOne();
      if (!user) this.throwUserNotFound();
      if (
        !(await this.passwords.verify(user.passwordHash, dto.currentPassword))
      ) {
        throw new UnauthorizedException({
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'The current password is incorrect',
        });
      }

      user.passwordHash = await this.passwords.hash(dto.newPassword);
      await manager.save(user);
      await this.revokeAuthenticationArtifacts(manager, idUser);
      await this.auditService.recordUserAction(
        manager,
        AuditAction.Update,
        idUser,
        {
          password: 'changed',
        },
      );
    });
  }

  async deleteAccount(idUser: number, dto: DeleteAccountDto): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const user = await manager
        .createQueryBuilder(User, 'user')
        .addSelect('user.passwordHash')
        .setLock('pessimistic_write')
        .where('user.id = :idUser', { idUser })
        .getOne();
      if (!user) this.throwUserNotFound();
      if (
        !(await this.passwords.verify(user.passwordHash, dto.currentPassword))
      ) {
        throw new UnauthorizedException({
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'The current password is incorrect',
        });
      }

      await this.revokeAuthenticationArtifacts(manager, idUser);
      await manager.softRemove(user);
      await this.auditService.recordUserAction(
        manager,
        AuditAction.Delete,
        idUser,
        null,
      );
    });
  }

  async getPreferences(idUser: number): Promise<UserPreferencesResponseDto> {
    await this.findUser(idUser);
    const [categories, profile] = await Promise.all([
      this.findActivePreferenceCategories(idUser),
      this.dataSource.manager.findOne(UserPreferenceProfile, {
        where: { idUser },
      }),
    ]);
    return this.toPreferencesResponse(categories, profile);
  }

  async updatePreferences(
    idUser: number,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager
        .createQueryBuilder(User, 'user')
        .setLock('pessimistic_write')
        .where('user.id = :idUser', { idUser })
        .getOne();
      if (!user) this.throwUserNotFound();

      const categories = await this.findAvailableCategories(
        manager,
        dto.categoryIds,
      );
      if (categories.length !== dto.categoryIds.length) {
        throw new UnprocessableEntityException({
          code: 'CATEGORY_NOT_AVAILABLE',
          message: 'One or more selected categories are unavailable',
        });
      }

      const current = await manager.find(UserPreference, {
        where: { idUser },
      });
      const requestedIds = new Set(dto.categoryIds);
      const existingIds = new Set(
        current.map((preference) => preference.idCategory),
      );
      const toRemove = current.filter(
        (preference) => !requestedIds.has(preference.idCategory),
      );
      if (toRemove.length) await manager.softRemove(toRemove);

      const toAdd = categories
        .filter((category) => !existingIds.has(category.id))
        .map((category) =>
          manager.create(UserPreference, { idUser, idCategory: category.id }),
        );
      if (toAdd.length) await manager.save(toAdd);

      const profile = await this.upsertPreferenceProfile(manager, idUser, dto);

      await this.auditService.recordUserAction(
        manager,
        AuditAction.Update,
        idUser,
        {
          preferenceCategoryIds: dto.categoryIds,
          usualBudget: profile.usualBudget,
          usualPeopleCount: profile.usualPeopleCount,
          preferredArea: profile.preferredArea,
          preferredAreaPlaceId: profile.preferredAreaPlaceId,
          useDeviceLocation: profile.useDeviceLocation,
          maxDistanceKm: profile.maxDistanceKm,
        },
      );
      return this.toPreferencesResponse(
        this.toPreferenceCategories(categories),
        profile,
      );
    });
  }

  /**
   * Applies the scalar profile fields from an update. A field left out of
   * the DTO keeps its stored value; an explicit `null` clears it. The
   * preferred area's label + placeId + coordinates move together.
   */
  private async upsertPreferenceProfile(
    manager: EntityManager,
    idUser: number,
    dto: UpdatePreferencesDto,
  ): Promise<UserPreferenceProfile> {
    const profile =
      (await manager.findOne(UserPreferenceProfile, { where: { idUser } })) ??
      manager.create(UserPreferenceProfile, {
        idUser,
        usualBudget: null,
        usualPeopleCount: null,
        preferredArea: null,
        preferredAreaPlaceId: null,
        preferredAreaLatitude: null,
        preferredAreaLongitude: null,
        useDeviceLocation: false,
        maxDistanceKm: null,
      });

    if (dto.usualBudget !== undefined) profile.usualBudget = dto.usualBudget;
    if (dto.usualPeopleCount !== undefined) {
      profile.usualPeopleCount = dto.usualPeopleCount;
    }
    if (dto.preferredArea !== undefined) {
      const area = dto.preferredArea;
      profile.preferredArea = area ? area.label.trim() : null;
      profile.preferredAreaPlaceId = area ? area.placeId : null;
      profile.preferredAreaLatitude = area ? area.latitude : null;
      profile.preferredAreaLongitude = area ? area.longitude : null;
    }
    if (dto.useDeviceLocation !== undefined) {
      profile.useDeviceLocation = dto.useDeviceLocation;
    }
    if (dto.maxDistanceKm !== undefined) {
      profile.maxDistanceKm = dto.maxDistanceKm;
    }

    return manager.save(profile);
  }

  private toPreferencesResponse(
    categories: UserPreferenceCategoryDto[],
    profile: UserPreferenceProfile | null,
  ): UserPreferencesResponseDto {
    return {
      categories,
      usualBudget: profile?.usualBudget ?? null,
      usualPeopleCount: profile?.usualPeopleCount ?? null,
      preferredArea:
        profile?.preferredArea != null &&
        profile.preferredAreaPlaceId != null &&
        profile.preferredAreaLatitude != null &&
        profile.preferredAreaLongitude != null
          ? {
              label: profile.preferredArea,
              placeId: profile.preferredAreaPlaceId,
              latitude: profile.preferredAreaLatitude,
              longitude: profile.preferredAreaLongitude,
            }
          : null,
      useDeviceLocation: profile?.useDeviceLocation ?? false,
      maxDistanceKm: profile?.maxDistanceKm ?? null,
    };
  }

  private async findUser(
    idUser: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<User> {
    const user = await manager.findOne(User, {
      where: { id: idUser },
      relations: { role: true, status: true },
    });
    if (!user) this.throwUserNotFound();
    return user;
  }

  private async findAvailableCategories(
    manager: EntityManager,
    categoryIds: number[],
  ): Promise<Category[]> {
    if (!categoryIds.length) return [];
    return manager
      .createQueryBuilder(Category, 'category')
      .innerJoin('category.status', 'status')
      .where({ id: In(categoryIds) })
      .andWhere('status.key = :activeStatus', { activeStatus: 'active' })
      .orderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .getMany();
  }

  private async findActivePreferenceCategories(
    idUser: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<UserPreferenceCategoryDto[]> {
    const preferences = await manager
      .createQueryBuilder(UserPreference, 'preference')
      .innerJoinAndSelect('preference.category', 'category')
      .innerJoin('category.status', 'status')
      .where('preference.id_user = :idUser', { idUser })
      .andWhere('status.key = :activeStatus', { activeStatus: 'active' })
      .orderBy('category.name', 'ASC')
      .addOrderBy('category.id', 'ASC')
      .getMany();
    return this.toPreferenceCategories(
      preferences.map(({ category }) => category),
    );
  }

  private toProfile(user: User): UserProfileResponseDto {
    return {
      id: user.id,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      role: { key: user.role.key, name: user.role.name },
      status: { key: user.status.key, name: user.status.name },
    };
  }

  private toPreferenceCategories(
    categories: Category[],
  ): UserPreferenceCategoryDto[] {
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
    }));
  }

  private async revokeAuthenticationArtifacts(
    manager: EntityManager,
    idUser: number,
  ): Promise<void> {
    await manager.update(
      UserSession,
      { idUser, active: true },
      { active: false },
    );
    await manager.update(
      PasswordRecovery,
      { idUser, used: false },
      { used: true },
    );
  }

  private throwUserNotFound(): never {
    throw new NotFoundException({
      code: 'USER_NOT_FOUND',
      message: 'The requested user does not exist',
    });
  }
}
