import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalDataUsage1787608322113 implements MigrationInterface {
  name = 'AddExternalDataUsage1787608322113';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "external_data_usage" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_external_provider" integer NOT NULL, "external_reference" character varying(255) NOT NULL, "context" character varying(60) NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_697700ce54f02fe8fb3ab09c045" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bf63618842c60316fc4ffcb0eb" ON "external_data_usage" ("id_external_provider") `,
    );
    await queryRunner.query(
      `ALTER TABLE "external_data_usage" ADD CONSTRAINT "FK_bf63618842c60316fc4ffcb0eb0" FOREIGN KEY ("id_external_provider") REFERENCES "external_provider"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "external_data_usage" DROP CONSTRAINT "FK_bf63618842c60316fc4ffcb0eb0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bf63618842c60316fc4ffcb0eb"`,
    );
    await queryRunner.query(`DROP TABLE "external_data_usage"`);
  }
}
