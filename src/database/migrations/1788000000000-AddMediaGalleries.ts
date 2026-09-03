import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaGalleries1788000000000 implements MigrationInterface {
  name = 'AddMediaGalleries1788000000000';
  async up(q: QueryRunner): Promise<void> {
    const tables: Array<[string, string, string]> = [
      ['user_avatar', 'id_user', 'user'],
      ['activity_image', 'id_activity', 'activity'],
      ['place_image', 'id_place', 'place'],
      ['plan_image', 'id_plan', 'plan'],
      ['rating_image', 'id_rating', 'rating'],
      ['feedback_image', 'id_feedback', 'feedback'],
    ];
    for (const [table, owner, parent] of tables) {
      const current =
        table === 'user_avatar'
          ? ', "is_current" boolean NOT NULL DEFAULT true'
          : ', "is_primary" boolean NOT NULL DEFAULT false';
      await q.query(
        `CREATE TABLE "${table}" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "${owner}" integer NOT NULL, "object_key" character varying(500) NOT NULL, "content_type" character varying(100) NOT NULL, "byte_size" integer NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "display_order" smallint NOT NULL DEFAULT 0${current}, CONSTRAINT "PK_${table}" PRIMARY KEY ("id"), CONSTRAINT "UQ_${table}_object_key" UNIQUE ("object_key"), CONSTRAINT "CHK_${table}_size" CHECK ("byte_size" > 0), CONSTRAINT "CHK_${table}_width" CHECK ("width" > 0), CONSTRAINT "CHK_${table}_height" CHECK ("height" > 0))`,
      );
      await q.query(
        `CREATE INDEX "IDX_${table}_${owner}" ON "${table}" ("${owner}")`,
      );
      const flag = table === 'user_avatar' ? 'is_current' : 'is_primary';
      await q.query(
        `CREATE UNIQUE INDEX "IDX_${table}_${flag}" ON "${table}" ("${owner}") WHERE "${flag}" = true AND "deleted_at" IS NULL`,
      );
      await q.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "FK_${table}_${parent}" FOREIGN KEY ("${owner}") REFERENCES "${parent}"("id") ON DELETE CASCADE`,
      );
    }
  }
  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      'feedback_image',
      'rating_image',
      'plan_image',
      'place_image',
      'activity_image',
      'user_avatar',
    ])
      await q.query(`DROP TABLE "${table}"`);
  }
}
