import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { PasswordService } from '../auth/security/password.service';
import { AuditService } from '../common/audit/audit.service';
import { Role } from '../users/entities/role.entity';
import { UserStatus } from '../users/entities/user-status.entity';
import { User } from '../users/entities/user.entity';
import { UserStatusKey } from './dto/admin-list-query.dto';
import { AdminUserDto } from './dto/administration-response.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { AuditAction } from './entities/audit-log.entity';

/**
 * Account creation from the administration panel (CU57).
 *
 * Kept apart from `AdministrationService` so creating an account depends on
 * the password hasher without every other administration operation (and its
 * tests) having to.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async createUser(
    actorId: number,
    dto: CreateAdminUserDto,
  ): Promise<AdminUserDto> {
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.ensureEmailAvailable(manager, dto.email);
        const role = await manager.findOne(Role, { where: { key: dto.role } });
        if (!role) {
          throw new NotFoundException({
            code: 'ROLE_NOT_FOUND',
            message: 'The role does not exist',
          });
        }
        const status = await manager.findOne(UserStatus, {
          where: { key: dto.status },
        });
        if (!status) {
          throw new NotFoundException({
            code: 'USER_STATUS_NOT_FOUND',
            message: 'The user status does not exist',
          });
        }

        const user = await manager.save(
          manager.create(User, {
            name: dto.name,
            lastName: dto.lastName,
            email: dto.email,
            passwordHash,
            idRole: role.id,
            idUserStatus: status.id,
          }),
        );
        await this.auditService.record(
          manager,
          AuditAction.Create,
          'user',
          user.id,
          { email: user.email, role: role.key, status: status.key },
          actorId,
        );
        return {
          id: user.id,
          name: user.name,
          lastName: user.lastName,
          email: user.email,
          role: { key: role.key, name: role.name },
          status: { key: status.key as UserStatusKey, name: status.name },
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
      });
    } catch (error) {
      // A concurrent request can still win the race past the check above.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      ) {
        throw this.emailTaken();
      }
      throw error;
    }
  }

  /** Includes deleted accounts: their email still holds the unique index. */
  private async ensureEmailAvailable(
    manager: EntityManager,
    email: string,
  ): Promise<void> {
    const owner = await manager.findOne(User, {
      where: { email },
      withDeleted: true,
    });
    if (owner) throw this.emailTaken();
  }

  private emailTaken(): ConflictException {
    return new ConflictException({
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'The email is already registered',
    });
  }
}
