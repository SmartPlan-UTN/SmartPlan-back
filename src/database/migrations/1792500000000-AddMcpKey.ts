import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * API keys for the MCP server (`src/mcp`). Only the SHA-256 hash of each key
 * is stored; the key is shown once when an administrator generates it.
 */
export class AddMcpKey1792500000000 implements MigrationInterface {
  name = 'AddMcpKey1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mcp_key" (
        "id" SERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "name" character varying(100) NOT NULL,
        "key_hash" character(64) NOT NULL,
        "prefix" character varying(16) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_c2797d66251c26e58b5e2a18026" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mcp_key_hash" ON "mcp_key" ("key_hash") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_mcp_key_hash"`);
    await queryRunner.query(`DROP TABLE "mcp_key"`);
  }
}
