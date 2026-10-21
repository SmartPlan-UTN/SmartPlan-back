import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive schema only: historical requests keep null radius fields. */
export class AddGenerationSearchRadius1791817200000 implements MigrationInterface {
  name = 'AddGenerationSearchRadius1791817200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plan_request"
      ADD "resolved_latitude" double precision,
      ADD "resolved_longitude" double precision,
      ADD "applied_max_distance_km" integer,
      ADD CONSTRAINT "CHK_plan_request_resolved_latitude" CHECK ("resolved_latitude" IS NULL OR "resolved_latitude" BETWEEN -90 AND 90),
      ADD CONSTRAINT "CHK_plan_request_resolved_longitude" CHECK ("resolved_longitude" IS NULL OR "resolved_longitude" BETWEEN -180 AND 180),
      ADD CONSTRAINT "CHK_plan_request_resolved_coordinates" CHECK (("resolved_latitude" IS NULL) = ("resolved_longitude" IS NULL)),
      ADD CONSTRAINT "CHK_plan_request_applied_radius" CHECK ("applied_max_distance_km" IS NULL OR ("applied_max_distance_km" > 0 AND "resolved_latitude" IS NOT NULL AND "resolved_longitude" IS NOT NULL))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "plan_request"
      DROP CONSTRAINT "CHK_plan_request_applied_radius",
      DROP CONSTRAINT "CHK_plan_request_resolved_coordinates",
      DROP CONSTRAINT "CHK_plan_request_resolved_longitude",
      DROP CONSTRAINT "CHK_plan_request_resolved_latitude",
      DROP COLUMN "applied_max_distance_km",
      DROP COLUMN "resolved_longitude",
      DROP COLUMN "resolved_latitude"
    `);
  }
}
