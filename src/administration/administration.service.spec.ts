import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Activity } from '../activities/entities/activity.entity';
import { Plan } from '../plans/entities/plan.entity';
import { Rating } from '../ratings/entities/rating.entity';
import { User } from '../users/entities/user.entity';
import { AdministrationService } from './administration.service';
import { UserStatusKey } from './dto/admin-list-query.dto';
import { AuditLog } from './entities/audit-log.entity';

describe('AdministrationService', () => {
  let service: AdministrationService;

  beforeEach(() => {
    service = new AdministrationService(
      {} as DataSource,
      {} as Repository<User>,
      {} as Repository<Activity>,
      {} as Repository<Plan>,
      {} as Repository<Rating>,
      {} as Repository<AuditLog>,
      {} as never,
    );
  });

  it('rejects an administrator who suspends their own account (CU57)', async () => {
    await expect(
      service.changeUserStatus(5, 5, {
        status: UserStatusKey.SUSPENDED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an empty user update (CU57)', async () => {
    await expect(service.updateUser(5, 7, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty activity update (CU53)', async () => {
    await expect(service.updateActivity(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an empty plan update (CU60)', async () => {
    await expect(service.updatePlan(1, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
