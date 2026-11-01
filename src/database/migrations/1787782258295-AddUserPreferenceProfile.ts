import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPreferenceProfile1787782258295 implements MigrationInterface {
  name = 'AddUserPreferenceProfile1787782258295';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "user_preference_profile" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_user" integer NOT NULL, "usual_budget" numeric(10,2), "usual_people_count" integer, "preferred_area" character varying(160), "preferred_area_place_id" character varying(400), "preferred_area_latitude" numeric(9,6), "preferred_area_longitude" numeric(9,6), "use_device_location" boolean NOT NULL DEFAULT false, "max_distance_km" integer, CONSTRAINT "CHK_d51e51bd595f8c0ddb0830e978" CHECK ((
    "preferred_area" IS NULL
    AND "preferred_area_place_id" IS NULL
    AND "preferred_area_latitude" IS NULL
    AND "preferred_area_longitude" IS NULL
  ) OR (
    "preferred_area" IS NOT NULL
    AND "preferred_area_place_id" IS NOT NULL
    AND "preferred_area_latitude" IS NOT NULL
    AND "preferred_area_longitude" IS NOT NULL
  )), CONSTRAINT "CHK_a3359f0ff6c7c6c53ad09ab0b8" CHECK ("max_distance_km" IS NULL OR ("max_distance_km" >= 1 AND "max_distance_km" <= 50)), CONSTRAINT "CHK_4369acbb03f65a4e30756a7a81" CHECK ("usual_people_count" IS NULL OR "usual_people_count" >= 1), CONSTRAINT "CHK_fd867c960d54db2323dd83e961" CHECK ("usual_budget" IS NULL OR "usual_budget" > 0), CONSTRAINT "PK_a588111cd594be3685f8302ce53" PRIMARY KEY ("id"))`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_611f472de1a63f3699c6138d88" ON "user_preference_profile" ("id_user") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preference_profile" ADD CONSTRAINT "FK_fe37edd1d130a3609db61f9654d" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_preference_profile" DROP CONSTRAINT "FK_fe37edd1d130a3609db61f9654d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_611f472de1a63f3699c6138d88"`,
    );
    await queryRunner.query(`DROP TABLE "user_preference_profile"`);
  }
}
