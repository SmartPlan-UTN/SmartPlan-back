import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { seedInitialData } from '../src/database/seeds/seed';
import { Role } from '../src/users/entities/role.entity';
import { UserStatus } from '../src/users/entities/user-status.entity';
import { User } from '../src/users/entities/user.entity';
import { Plan, PlanKind } from '../src/plans/entities/plan.entity';
import { PlanStatus } from '../src/plans/entities/plan-status.entity';
import { FeedbackStatus } from '../src/recommendation/entities/feedback-status.entity';
import { getConnectionData } from './test-database';

describe('Community consent migration on the complete production schema (#142)', () => {
  it('withdraws legacy sharing without deleting feedback and never republishes it during rollback', async () => {
    const connection = getConnectionData();
    const db = new DataSource({
      type: 'postgres',
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database: connection.database,
      entities: [join(__dirname, '../src/**/*.entity.ts')],
      migrations: [join(__dirname, '../src/database/migrations/*.ts')],
      synchronize: false,
      logging: false,
    });
    await db.initialize();
    try {
      const consentIndex = db.migrations.findIndex(
        (migration) =>
          migration.name === 'AddCommunityConsentVersion1793100000000',
      );
      if (consentIndex < 0)
        throw new Error('Community consent migration not found');
      const [consent] = db.migrations.splice(consentIndex, 1);
      await db.runMigrations({ transaction: 'all' });
      await seedInitialData(db);
      const user = await db.getRepository(User).save({
        name: 'Fixture',
        lastName: 'Author',
        email: 'consent@fixture.test',
        username: 'fixture_author',
        passwordHash: 'unused-test-hash',
        idRole: (await db.getRepository(Role).findOneByOrFail({ key: 'user' }))
          .id,
        idUserStatus: (
          await db.getRepository(UserStatus).findOneByOrFail({ key: 'active' })
        ).id,
      });
      const completedStatus = await db
        .getRepository(PlanStatus)
        .findOneByOrFail({ key: 'completed' });
      const plan = await db.getRepository(Plan).save({
        title: 'Fixture completed outing',
        idUser: user.id,
        kind: PlanKind.Outing,
        completedAt: new Date(),
        idPlanStatus: completedStatus.id,
      });
      const status = await db
        .getRepository(FeedbackStatus)
        .findOneByOrFail({ key: 'pending' });
      await db.query(
        'INSERT INTO feedback (id_plan, id_feedback_status, rating, comment, is_shared, shared_at) VALUES ($1, $2, 5, $3, true, now())',
        [plan.id, status.id, 'Preserved private comment'],
      );
      db.migrations.push(consent);
      const applied = await db.runMigrations({ transaction: 'all' });
      expect(applied.map((migration) => migration.name)).toEqual([
        'AddCommunityConsentVersion1793100000000',
      ]);
      expect(
        await db.query(
          'SELECT is_shared, shared_at, community_consent_version, rating, comment FROM feedback',
        ),
      ).toEqual([
        {
          is_shared: false,
          shared_at: null,
          community_consent_version: 0,
          rating: 5,
          comment: 'Preserved private comment',
        },
      ]);
      await db.undoLastMigration({ transaction: 'all' });
      expect(await db.query('SELECT is_shared, comment FROM feedback')).toEqual(
        [{ is_shared: false, comment: 'Preserved private comment' }],
      );
      await db.runMigrations({ transaction: 'all' });
      expect(
        await db.query(
          'SELECT is_shared, community_consent_version FROM feedback',
        ),
      ).toEqual([{ is_shared: false, community_consent_version: 0 }]);
    } finally {
      await db.destroy();
    }
  });
});
