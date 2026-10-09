import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserPreferenceProfile } from './entities/user-preference-profile.entity';
import { UserPreferenceProfileLookupService } from './user-preference-profile-lookup.service';

/**
 * Slim, dependency-free module around `UserPreferenceProfile`. Exists
 * separately from `UsersModule` so the worker process (plan generation) and
 * `RecommendationModule` can read the stored budget/party-size/area/distance
 * preferences as a generation fallback without importing `UsersModule`'s
 * `AuthModule` dependency.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserPreferenceProfile])],
  providers: [UserPreferenceProfileLookupService],
  exports: [UserPreferenceProfileLookupService],
})
export class UserPreferenceProfileModule {}
