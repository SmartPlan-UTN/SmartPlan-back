import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferenceProfile } from './entities/user-preference-profile.entity';

/**
 * Read-only access to `UserPreferenceProfile`, split out of `UsersService` so
 * the plan-generation pipeline (worker process) can depend on it without
 * pulling in `UsersModule`'s `AuthModule` import and the rest of the account
 * surface it has no business touching.
 */
@Injectable()
export class UserPreferenceProfileLookupService {
  constructor(
    @InjectRepository(UserPreferenceProfile)
    private readonly profiles: Repository<UserPreferenceProfile>,
  ) {}

  findByUser(idUser: number): Promise<UserPreferenceProfile | null> {
    return this.profiles.findOne({ where: { idUser } });
  }
}
