import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1787671826564 implements MigrationInterface {
  name = 'InitialSchema1787671826564';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "collection" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_user" integer NOT NULL, "name" character varying(100) NOT NULL, "description" character varying(500), "saved_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_ad3f485bbc99d875491f44d7c85" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_08ef9f51b1b00a726fc8561417" ON "collection" ("id_user", "name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "favorite_collection" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_collection" integer NOT NULL, "id_activity" integer NOT NULL, "order" smallint, CONSTRAINT "CHK_bfd1a871693e8add3723f82c19" CHECK ("order" IS NULL OR "order" > 0), CONSTRAINT "PK_262a15eb9d47920313b4cdef2b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eddaacf59776b7a807dfda4f26" ON "favorite_collection" ("id_activity") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_86d830670d3b0b44a625e433bb" ON "favorite_collection" ("id_collection", "id_activity") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "plan_detail" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_plan" integer NOT NULL, "id_activity" integer NOT NULL, "order" smallint NOT NULL, "estimated_cost" numeric(10,2) NOT NULL DEFAULT '0', "estimated_duration" integer NOT NULL DEFAULT '0', "note" text, CONSTRAINT "CHK_f1aaf4a71b55e18fa8ef865ddc" CHECK ("estimated_duration" >= 0), CONSTRAINT "CHK_79ceb8e01a45a9010167f4b118" CHECK ("estimated_cost" >= 0), CONSTRAINT "CHK_d2822ad17164302dcc8ecb18eb" CHECK ("order" > 0), CONSTRAINT "PK_92d479c2cde894c6f0766990202" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8d70af976c0598c61bc6705e88" ON "plan_detail" ("id_activity") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_018c5045215d150de7b3f4829a" ON "plan_detail" ("id_plan", "id_activity") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_790bed023bc91418a3972b564b" ON "plan_detail" ("id_plan", "order") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "feedback_status" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), CONSTRAINT "PK_70c14a5a0617efcc63c8ca4c516" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_abdd6449363e309455d948c8e4" ON "feedback_status" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "country" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(100) NOT NULL, "description" text, CONSTRAINT "PK_bf6e37c231c4f4ea56dcd887269" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_290058c5e6a2026e59ccadaf6e" ON "country" ("name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "city" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_country" integer NOT NULL, "name" character varying(100) NOT NULL, "description" text, CONSTRAINT "PK_b222f51ce26f7e5ca86944a6739" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_be676cb6e1c586b738ed09d4e4" ON "city" ("id_country", "name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "activity_place" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_activity" integer NOT NULL, "id_place" integer NOT NULL, "latitude" numeric(9,6), "longitude" numeric(9,6), "notes" text, "google_place_id" character varying(255), "external_rating" numeric(2,1), "external_rating_count" integer, CONSTRAINT "CHK_db963ef8e4be5ac5a067eafc99" CHECK (("external_rating" IS NULL AND "external_rating_count" IS NULL) OR ("external_rating" IS NOT NULL AND "external_rating_count" IS NOT NULL)), CONSTRAINT "CHK_d47955359d965af11ff39316dc" CHECK ("external_rating" IS NULL OR "external_rating" BETWEEN 0 AND 5), CONSTRAINT "CHK_93b3f3f06e527878ed3c4b1c83" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL)), CONSTRAINT "CHK_e351355ce206a8a9bc3b8376b7" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180), CONSTRAINT "CHK_8d7797f4ea89f285602bf0581e" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90), CONSTRAINT "PK_dadc774508804c6364a400c2f31" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_847e54a8d3c4d7b6657c479e80" ON "activity_place" ("id_place") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_813432ef36d5a788844f08ffe5" ON "activity_place" ("google_place_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1e7627cd9ed9426110c74f8e4a" ON "activity_place" ("latitude", "longitude") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e737d2fcd000f7a38eb9d09436" ON "activity_place" ("id_activity", "id_place") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "place" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(150) NOT NULL, "description" text, "address" character varying(255) NOT NULL, "id_department" integer NOT NULL, CONSTRAINT "PK_96ab91d43aa89c5de1b59ee7cca" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_493d5e591af774a1587d363fb8" ON "place" ("name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a5b94c9a175414243ee7e98a92" ON "place" ("id_department") `,
    );
    await queryRunner.query(
      `CREATE TABLE "department" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_city" integer NOT NULL, "name" character varying(100) NOT NULL, "description" text, CONSTRAINT "PK_9a2213262c1593bffb581e382f5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6e9bc44724b72646f0f2571158" ON "department" ("id_city", "name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "request_status" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), CONSTRAINT "PK_0626b8725de83cd783214d420dd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0ec539907c15fb8bf964941f49" ON "request_status" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "activity_category" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_activity" integer NOT NULL, "id_category" integer NOT NULL, CONSTRAINT "PK_5d3d888450207667a286922f945" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9af3fb7cfedb1b69f83ff88ea2" ON "activity_category" ("id_category") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_687f244e78af9d85fed2ea1727" ON "activity_category" ("id_activity", "id_category") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_preference" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_user" integer NOT NULL, "id_category" integer NOT NULL, CONSTRAINT "PK_0532217bd629d0ccf06499c5841" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aead4bcefd72f4096768235fe2" ON "user_preference" ("id_category") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_41d933a4d2bedbc095375fd501" ON "user_preference" ("id_user", "id_category") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "category_status" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), CONSTRAINT "PK_a7966adcb5865aa30c7c417762f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c915fbdb440e68d8456b14ab63" ON "category_status" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "category" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "description" text, "id_category_status" integer NOT NULL, CONSTRAINT "PK_9c4e4a89e3674fc9f382d733f03" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d33abebaa7dad62b5695385aa2" ON "category" ("name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_594f925a1375f48c9b6cea0d47" ON "category" ("id_category_status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "plan_request_category" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_plan_request" integer NOT NULL, "id_category" integer NOT NULL, "description" text, CONSTRAINT "PK_843962f6019e5688b23722a27ac" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0c5bebce2c2ad5c721e8c2e608" ON "plan_request_category" ("id_category") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_737005e87d8fb21fd7c7dfb791" ON "plan_request_category" ("id_plan_request", "id_category") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "outing_type" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), CONSTRAINT "PK_f8da0864cb3dd1f273858cb00f0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c9bf58bc12c00311b5bccf606b" ON "outing_type" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "plan_request" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_user" integer NOT NULL, "budget" numeric(10,2) NOT NULL, "id_department" integer NOT NULL, "available_duration" integer NOT NULL, "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL, "id_outing_type" integer NOT NULL, "id_request_status" integer NOT NULL, "notes" text, CONSTRAINT "CHK_6d4e2de64d1ee96d8b0decab06" CHECK ("available_duration" > 0), CONSTRAINT "CHK_5df272fb239f131373f1911ffe" CHECK ("budget" >= 0), CONSTRAINT "PK_b126b1c6b58867f20a45070b87c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a62b564e4aaf829dbe6e4eba9b" ON "plan_request" ("id_user") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aaa887b443a1b79d99a28bca04" ON "plan_request" ("id_department") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c8b05169f54edc259107161773" ON "plan_request" ("requested_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3073e4d800bbcaafa89a8da1f" ON "plan_request" ("id_outing_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_962e345073b3ce77512f3d2b1b" ON "plan_request" ("id_request_status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "feedback" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "title" character varying(150) NOT NULL, "description" text, "actual_cost" numeric(10,2), "actual_duration" integer, "id_plan_request" integer NOT NULL, "id_feedback_status" integer NOT NULL, CONSTRAINT "CHK_28829ec5b947ec98b5b9bca62a" CHECK ("actual_duration" IS NULL OR "actual_duration" >= 0), CONSTRAINT "CHK_cc3c345cedcd9beed043882d91" CHECK ("actual_cost" IS NULL OR "actual_cost" >= 0), CONSTRAINT "PK_8389f9e087a57689cd5be8b2b13" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5afd8f4854a99c7e1bced77fa0" ON "feedback" ("id_plan_request") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d4ba45564dde34e1645d59f4f2" ON "feedback" ("id_feedback_status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rating_moderation_status_enum" AS ENUM('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rating" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "score" smallint NOT NULL, "id_activity" integer NOT NULL, "id_user" integer NOT NULL, "id_plan" integer NOT NULL, "comment" text, "moderation_status" "public"."rating_moderation_status_enum" NOT NULL, "moderation_reason" character varying(500), "id_feedback" integer, CONSTRAINT "CHK_e40ca4514232a7fd8b402a0cc6" CHECK ("score" BETWEEN 1 AND 5), CONSTRAINT "PK_ecda8ad32645327e4765b43649e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_84c5b463e91da4d0a59198d829" ON "rating" ("id_activity") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_280489b21204a6a9a7ca4bd5fc" ON "rating" ("id_user") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f894f1cd8a11bf7e7b401ac411" ON "rating" ("id_plan") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_894e73982699f6bc5a20ab0c30" ON "rating" ("id_feedback") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rating_moderation_created" ON "rating" ("moderation_status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_rating_user_activity_unique" ON "rating" ("id_user", "id_activity") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "activity" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(150) NOT NULL, "description" text NOT NULL, "estimated_cost" numeric(10,2) NOT NULL, "estimated_duration" integer NOT NULL, "type" character varying(80), CONSTRAINT "CHK_dc158e0c81ab3f29e5f71bb3e9" CHECK ("estimated_duration" > 0), CONSTRAINT "CHK_147a9ed2c8c3485f276c632b94" CHECK ("estimated_cost" >= 0), CONSTRAINT "PK_24625a1d6b1b089c8ae206fe467" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e0098522faf604f4f29ba54bba" ON "activity" ("name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_activity_type" ON "activity" ("type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "favorite_activity" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_favorite_list" integer NOT NULL, "id_activity" integer NOT NULL, CONSTRAINT "PK_1ea5e1203a62e3c9f5447481d6e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a3421276afdf416ce3b7f18d7e" ON "favorite_activity" ("id_activity") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ebe09b3615ef90f4faf3d155a3" ON "favorite_activity" ("id_favorite_list", "id_activity") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "favorite_list" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_user" integer NOT NULL, CONSTRAINT "PK_298ea5adef17b30abd7df2d3a1d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1c5f1440a4fe044d9ac341de2d" ON "favorite_list" ("id_user") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "favorite_plan" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_favorite_list" integer NOT NULL, "id_plan" integer NOT NULL, CONSTRAINT "PK_49045d7fa9542aedfe56f4103e2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a2a42cd3e56ac76a7a75935462" ON "favorite_plan" ("id_plan") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_db82c964589f17d1add51a57e9" ON "favorite_plan" ("id_favorite_list", "id_plan") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "plan_status" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), CONSTRAINT "PK_fd8b3ee3c792a415a92c7cdf68e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1c4a23db026ef4d9fa61826838" ON "plan_status" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "plan" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "title" character varying(150) NOT NULL, "description" text, "id_user" integer NOT NULL, "id_plan_request" integer, "id_plan_status" integer NOT NULL, "estimated_total_cost" numeric(10,2) NOT NULL DEFAULT '0', "estimated_total_duration" integer NOT NULL DEFAULT '0', "people_count" integer NOT NULL DEFAULT '1', CONSTRAINT "CHK_4dd34b6afff78e08fd2b359bdc" CHECK ("people_count" >= 1), CONSTRAINT "CHK_f297398936e6d07ff18b222385" CHECK ("estimated_total_duration" >= 0), CONSTRAINT "CHK_b1cdbfd78ad6ce6459ad86df0c" CHECK ("estimated_total_cost" >= 0), CONSTRAINT "PK_54a2b686aed3b637654bf7ddbb3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_817fa32cb3021dc2a1dff5a257" ON "plan" ("id_user") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9179b370165f41d24656eebf15" ON "plan" ("id_plan_request") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_260a48db09e6cf1f0a30c09b2d" ON "plan" ("id_plan_status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_status" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), CONSTRAINT "PK_892a2061d6a04a7e2efe4c26d6f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_2866a10f50d07972a1da12e875" ON "user_status" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "permission" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), CONSTRAINT "PK_3b8b97af9d9d8807e41e6f48362" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5d633cd0453ef3c66394c72945" ON "permission" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permission" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_role" integer NOT NULL, "id_permission" integer NOT NULL, CONSTRAINT "PK_96c8f1fd25538d3692024115b47" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0f35e0a93838653f6897b4a027" ON "role_permission" ("id_permission") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d7ced4e28814b528d0ce82e095" ON "role_permission" ("id_role", "id_permission") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "role" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), CONSTRAINT "PK_b36bcfe02fc8de3c57a8b2391c2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_52668bfcdca81cf2efff841d23" ON "role" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "last_name" character varying(80) NOT NULL, "email" character varying(150) NOT NULL, "password_hash" character varying(255) NOT NULL, "id_role" integer NOT NULL, "id_user_status" integer NOT NULL, CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_email_unique" ON "user" ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1a3abee4bf37fa00ebd698cede" ON "user" ("id_role") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb05b8c46c1cfcafc06a95c1b0" ON "user" ("id_user_status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "external_provider" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "description" character varying(200), "active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_5bd95d5d0f3421155db793598d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a6f8e54abaedd200cf2313eace" ON "external_provider" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "external_sync" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_external_provider" integer NOT NULL, "entity" character varying(60) NOT NULL, "status" character varying(30) NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ended_at" TIMESTAMP WITH TIME ZONE, "record_count" integer NOT NULL DEFAULT '0', "error_message" text, CONSTRAINT "CHK_f4fbee0d1e0d7a71442185be44" CHECK ("record_count" >= 0), CONSTRAINT "PK_870884e16c0756f77d38dc96c2e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6904aead17f7d9d8e5616d25e9" ON "external_sync" ("id_external_provider") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3341604ca272561529d5b766f1" ON "external_sync" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "external_data_usage" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_external_provider" integer NOT NULL, "external_reference" character varying(255) NOT NULL, "context" character varying(60) NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_697700ce54f02fe8fb3ab09c045" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bf63618842c60316fc4ffcb0eb" ON "external_data_usage" ("id_external_provider") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_session" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_user" integer NOT NULL, "token_hash" character varying(255) NOT NULL, "started_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "active" boolean NOT NULL DEFAULT true, "ip" character varying(45), CONSTRAINT "PK_adf3b49590842ac3cf54cac451a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_021d604169e4353aea74602898" ON "user_session" ("id_user") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9ccf6d901cef4067214284f327" ON "user_session" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_session_expires_at" ON "user_session" ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b1652d315367a10a8e0d6f7962" ON "user_session" ("active") `,
    );
    await queryRunner.query(
      `CREATE TABLE "password_recovery" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_user" integer NOT NULL, "token_hash" character varying(255) NOT NULL, "token_created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_104b7650227e31deb0f4c9e7d4b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_322ba10d822536cb4a19551a9c" ON "password_recovery" ("id_user") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_48cd92ec22bfb4dd7aec0c5e34" ON "password_recovery" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "system_parameter" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(80) NOT NULL, "value" numeric(12,2) NOT NULL, "description" text, CONSTRAINT "PK_a7c7ca5a051cd68ffcf0521738d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3c5f4aabf897b26e041c7f5ae9" ON "system_parameter" ("name") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "notification" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_user" integer NOT NULL, "title" character varying(150) NOT NULL, "message" text NOT NULL, CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_faae232c811e023f462f7a1f7c" ON "notification" ("id_user") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_log_action_enum" AS ENUM('create', 'update', 'delete', 'start_session', 'end_session')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "action" "public"."audit_log_action_enum" NOT NULL, "affected_entity" character varying(60) NOT NULL, "id_affected_entity" integer NOT NULL, "original" jsonb, "changes" jsonb, CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_951e6339a77994dfbad976b35c" ON "audit_log" ("action") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_89808b8678170a10b3467369a1" ON "audit_log" ("affected_entity", "id_affected_entity") `,
    );
    await queryRunner.query(
      `ALTER TABLE "collection" ADD CONSTRAINT "FK_a156157b092cd09e65786f78bb6" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_collection" ADD CONSTRAINT "FK_cd49cc223830fc33857b6539425" FOREIGN KEY ("id_collection") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_collection" ADD CONSTRAINT "FK_eddaacf59776b7a807dfda4f267" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_detail" ADD CONSTRAINT "FK_5f85b07722b2911f31d861558f0" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_detail" ADD CONSTRAINT "FK_8d70af976c0598c61bc6705e881" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "city" ADD CONSTRAINT "FK_d7b1033841f8dae54fb5f831e85" FOREIGN KEY ("id_country") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" ADD CONSTRAINT "FK_b196716c659700eea3a3fe11471" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" ADD CONSTRAINT "FK_847e54a8d3c4d7b6657c479e808" FOREIGN KEY ("id_place") REFERENCES "place"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "place" ADD CONSTRAINT "FK_a5b94c9a175414243ee7e98a928" FOREIGN KEY ("id_department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "department" ADD CONSTRAINT "FK_2470d8b786b68a00379ecc9b56e" FOREIGN KEY ("id_city") REFERENCES "city"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_category" ADD CONSTRAINT "FK_538996be20254429375fef4f160" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_category" ADD CONSTRAINT "FK_9af3fb7cfedb1b69f83ff88ea2a" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preference" ADD CONSTRAINT "FK_929bf880ac79d924c4596d16834" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preference" ADD CONSTRAINT "FK_aead4bcefd72f4096768235fe24" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" ADD CONSTRAINT "FK_594f925a1375f48c9b6cea0d47e" FOREIGN KEY ("id_category_status") REFERENCES "category_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request_category" ADD CONSTRAINT "FK_5bc75b9906570e51cf7c765afc0" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request_category" ADD CONSTRAINT "FK_0c5bebce2c2ad5c721e8c2e608b" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_a62b564e4aaf829dbe6e4eba9b9" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_aaa887b443a1b79d99a28bca043" FOREIGN KEY ("id_department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_a3073e4d800bbcaafa89a8da1fb" FOREIGN KEY ("id_outing_type") REFERENCES "outing_type"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" ADD CONSTRAINT "FK_962e345073b3ce77512f3d2b1b9" FOREIGN KEY ("id_request_status") REFERENCES "request_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "FK_5afd8f4854a99c7e1bced77fa04" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" ADD CONSTRAINT "FK_d4ba45564dde34e1645d59f4f29" FOREIGN KEY ("id_feedback_status") REFERENCES "feedback_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD CONSTRAINT "FK_84c5b463e91da4d0a59198d829b" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD CONSTRAINT "FK_280489b21204a6a9a7ca4bd5fc0" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD CONSTRAINT "FK_f894f1cd8a11bf7e7b401ac4116" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" ADD CONSTRAINT "FK_894e73982699f6bc5a20ab0c306" FOREIGN KEY ("id_feedback") REFERENCES "feedback"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_activity" ADD CONSTRAINT "FK_8a996055d1459c12d48b9720a58" FOREIGN KEY ("id_favorite_list") REFERENCES "favorite_list"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_activity" ADD CONSTRAINT "FK_a3421276afdf416ce3b7f18d7ee" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_list" ADD CONSTRAINT "FK_25291881fcd9d69b815fd062081" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_plan" ADD CONSTRAINT "FK_d2f0d233e73705b9e8b0fde1f55" FOREIGN KEY ("id_favorite_list") REFERENCES "favorite_list"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_plan" ADD CONSTRAINT "FK_a2a42cd3e56ac76a7a75935462b" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "FK_817fa32cb3021dc2a1dff5a2574" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "FK_9179b370165f41d24656eebf15d" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "FK_260a48db09e6cf1f0a30c09b2d2" FOREIGN KEY ("id_plan_status") REFERENCES "plan_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" ADD CONSTRAINT "FK_138a98e6fa0df562f107835eb49" FOREIGN KEY ("id_role") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" ADD CONSTRAINT "FK_0f35e0a93838653f6897b4a0274" FOREIGN KEY ("id_permission") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "FK_1a3abee4bf37fa00ebd698cedec" FOREIGN KEY ("id_role") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "FK_eb05b8c46c1cfcafc06a95c1b0f" FOREIGN KEY ("id_user_status") REFERENCES "user_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "external_sync" ADD CONSTRAINT "FK_6904aead17f7d9d8e5616d25e91" FOREIGN KEY ("id_external_provider") REFERENCES "external_provider"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "external_data_usage" ADD CONSTRAINT "FK_bf63618842c60316fc4ffcb0eb0" FOREIGN KEY ("id_external_provider") REFERENCES "external_provider"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_session" ADD CONSTRAINT "FK_021d604169e4353aea746028985" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_recovery" ADD CONSTRAINT "FK_322ba10d822536cb4a19551a9c3" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notification" ADD CONSTRAINT "FK_faae232c811e023f462f7a1f7c5" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notification" DROP CONSTRAINT "FK_faae232c811e023f462f7a1f7c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "password_recovery" DROP CONSTRAINT "FK_322ba10d822536cb4a19551a9c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_session" DROP CONSTRAINT "FK_021d604169e4353aea746028985"`,
    );
    await queryRunner.query(
      `ALTER TABLE "external_data_usage" DROP CONSTRAINT "FK_bf63618842c60316fc4ffcb0eb0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "external_sync" DROP CONSTRAINT "FK_6904aead17f7d9d8e5616d25e91"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "FK_eb05b8c46c1cfcafc06a95c1b0f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT "FK_1a3abee4bf37fa00ebd698cedec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" DROP CONSTRAINT "FK_0f35e0a93838653f6897b4a0274"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" DROP CONSTRAINT "FK_138a98e6fa0df562f107835eb49"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP CONSTRAINT "FK_260a48db09e6cf1f0a30c09b2d2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP CONSTRAINT "FK_9179b370165f41d24656eebf15d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP CONSTRAINT "FK_817fa32cb3021dc2a1dff5a2574"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_plan" DROP CONSTRAINT "FK_a2a42cd3e56ac76a7a75935462b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_plan" DROP CONSTRAINT "FK_d2f0d233e73705b9e8b0fde1f55"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_list" DROP CONSTRAINT "FK_25291881fcd9d69b815fd062081"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_activity" DROP CONSTRAINT "FK_a3421276afdf416ce3b7f18d7ee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_activity" DROP CONSTRAINT "FK_8a996055d1459c12d48b9720a58"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" DROP CONSTRAINT "FK_894e73982699f6bc5a20ab0c306"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" DROP CONSTRAINT "FK_f894f1cd8a11bf7e7b401ac4116"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" DROP CONSTRAINT "FK_280489b21204a6a9a7ca4bd5fc0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rating" DROP CONSTRAINT "FK_84c5b463e91da4d0a59198d829b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "FK_d4ba45564dde34e1645d59f4f29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "feedback" DROP CONSTRAINT "FK_5afd8f4854a99c7e1bced77fa04"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_962e345073b3ce77512f3d2b1b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_a3073e4d800bbcaafa89a8da1fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_aaa887b443a1b79d99a28bca043"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request" DROP CONSTRAINT "FK_a62b564e4aaf829dbe6e4eba9b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request_category" DROP CONSTRAINT "FK_0c5bebce2c2ad5c721e8c2e608b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_request_category" DROP CONSTRAINT "FK_5bc75b9906570e51cf7c765afc0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category" DROP CONSTRAINT "FK_594f925a1375f48c9b6cea0d47e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preference" DROP CONSTRAINT "FK_aead4bcefd72f4096768235fe24"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_preference" DROP CONSTRAINT "FK_929bf880ac79d924c4596d16834"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_category" DROP CONSTRAINT "FK_9af3fb7cfedb1b69f83ff88ea2a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_category" DROP CONSTRAINT "FK_538996be20254429375fef4f160"`,
    );
    await queryRunner.query(
      `ALTER TABLE "department" DROP CONSTRAINT "FK_2470d8b786b68a00379ecc9b56e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "place" DROP CONSTRAINT "FK_a5b94c9a175414243ee7e98a928"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" DROP CONSTRAINT "FK_847e54a8d3c4d7b6657c479e808"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_place" DROP CONSTRAINT "FK_b196716c659700eea3a3fe11471"`,
    );
    await queryRunner.query(
      `ALTER TABLE "city" DROP CONSTRAINT "FK_d7b1033841f8dae54fb5f831e85"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_detail" DROP CONSTRAINT "FK_8d70af976c0598c61bc6705e881"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_detail" DROP CONSTRAINT "FK_5f85b07722b2911f31d861558f0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_collection" DROP CONSTRAINT "FK_eddaacf59776b7a807dfda4f267"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorite_collection" DROP CONSTRAINT "FK_cd49cc223830fc33857b6539425"`,
    );
    await queryRunner.query(
      `ALTER TABLE "collection" DROP CONSTRAINT "FK_a156157b092cd09e65786f78bb6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_89808b8678170a10b3467369a1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_951e6339a77994dfbad976b35c"`,
    );
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP TYPE "public"."audit_log_action_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_faae232c811e023f462f7a1f7c"`,
    );
    await queryRunner.query(`DROP TABLE "notification"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3c5f4aabf897b26e041c7f5ae9"`,
    );
    await queryRunner.query(`DROP TABLE "system_parameter"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_48cd92ec22bfb4dd7aec0c5e34"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_322ba10d822536cb4a19551a9c"`,
    );
    await queryRunner.query(`DROP TABLE "password_recovery"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b1652d315367a10a8e0d6f7962"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_session_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9ccf6d901cef4067214284f327"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_021d604169e4353aea74602898"`,
    );
    await queryRunner.query(`DROP TABLE "user_session"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bf63618842c60316fc4ffcb0eb"`,
    );
    await queryRunner.query(`DROP TABLE "external_data_usage"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3341604ca272561529d5b766f1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6904aead17f7d9d8e5616d25e9"`,
    );
    await queryRunner.query(`DROP TABLE "external_sync"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a6f8e54abaedd200cf2313eace"`,
    );
    await queryRunner.query(`DROP TABLE "external_provider"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eb05b8c46c1cfcafc06a95c1b0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1a3abee4bf37fa00ebd698cede"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_user_email_unique"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_52668bfcdca81cf2efff841d23"`,
    );
    await queryRunner.query(`DROP TABLE "role"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d7ced4e28814b528d0ce82e095"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0f35e0a93838653f6897b4a027"`,
    );
    await queryRunner.query(`DROP TABLE "role_permission"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5d633cd0453ef3c66394c72945"`,
    );
    await queryRunner.query(`DROP TABLE "permission"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2866a10f50d07972a1da12e875"`,
    );
    await queryRunner.query(`DROP TABLE "user_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_260a48db09e6cf1f0a30c09b2d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9179b370165f41d24656eebf15"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_817fa32cb3021dc2a1dff5a257"`,
    );
    await queryRunner.query(`DROP TABLE "plan"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1c4a23db026ef4d9fa61826838"`,
    );
    await queryRunner.query(`DROP TABLE "plan_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_db82c964589f17d1add51a57e9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a2a42cd3e56ac76a7a75935462"`,
    );
    await queryRunner.query(`DROP TABLE "favorite_plan"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1c5f1440a4fe044d9ac341de2d"`,
    );
    await queryRunner.query(`DROP TABLE "favorite_list"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ebe09b3615ef90f4faf3d155a3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a3421276afdf416ce3b7f18d7e"`,
    );
    await queryRunner.query(`DROP TABLE "favorite_activity"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_activity_type"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e0098522faf604f4f29ba54bba"`,
    );
    await queryRunner.query(`DROP TABLE "activity"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rating_user_activity_unique"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_rating_moderation_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_894e73982699f6bc5a20ab0c30"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f894f1cd8a11bf7e7b401ac411"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_280489b21204a6a9a7ca4bd5fc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_84c5b463e91da4d0a59198d829"`,
    );
    await queryRunner.query(`DROP TABLE "rating"`);
    await queryRunner.query(
      `DROP TYPE "public"."rating_moderation_status_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d4ba45564dde34e1645d59f4f2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5afd8f4854a99c7e1bced77fa0"`,
    );
    await queryRunner.query(`DROP TABLE "feedback"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_962e345073b3ce77512f3d2b1b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a3073e4d800bbcaafa89a8da1f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c8b05169f54edc259107161773"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aaa887b443a1b79d99a28bca04"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a62b564e4aaf829dbe6e4eba9b"`,
    );
    await queryRunner.query(`DROP TABLE "plan_request"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c9bf58bc12c00311b5bccf606b"`,
    );
    await queryRunner.query(`DROP TABLE "outing_type"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_737005e87d8fb21fd7c7dfb791"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0c5bebce2c2ad5c721e8c2e608"`,
    );
    await queryRunner.query(`DROP TABLE "plan_request_category"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_594f925a1375f48c9b6cea0d47"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d33abebaa7dad62b5695385aa2"`,
    );
    await queryRunner.query(`DROP TABLE "category"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c915fbdb440e68d8456b14ab63"`,
    );
    await queryRunner.query(`DROP TABLE "category_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_41d933a4d2bedbc095375fd501"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aead4bcefd72f4096768235fe2"`,
    );
    await queryRunner.query(`DROP TABLE "user_preference"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_687f244e78af9d85fed2ea1727"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9af3fb7cfedb1b69f83ff88ea2"`,
    );
    await queryRunner.query(`DROP TABLE "activity_category"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0ec539907c15fb8bf964941f49"`,
    );
    await queryRunner.query(`DROP TABLE "request_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6e9bc44724b72646f0f2571158"`,
    );
    await queryRunner.query(`DROP TABLE "department"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a5b94c9a175414243ee7e98a92"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_493d5e591af774a1587d363fb8"`,
    );
    await queryRunner.query(`DROP TABLE "place"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e737d2fcd000f7a38eb9d09436"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1e7627cd9ed9426110c74f8e4a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_813432ef36d5a788844f08ffe5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_847e54a8d3c4d7b6657c479e80"`,
    );
    await queryRunner.query(`DROP TABLE "activity_place"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_be676cb6e1c586b738ed09d4e4"`,
    );
    await queryRunner.query(`DROP TABLE "city"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_290058c5e6a2026e59ccadaf6e"`,
    );
    await queryRunner.query(`DROP TABLE "country"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_abdd6449363e309455d948c8e4"`,
    );
    await queryRunner.query(`DROP TABLE "feedback_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_790bed023bc91418a3972b564b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_018c5045215d150de7b3f4829a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8d70af976c0598c61bc6705e88"`,
    );
    await queryRunner.query(`DROP TABLE "plan_detail"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_86d830670d3b0b44a625e433bb"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eddaacf59776b7a807dfda4f26"`,
    );
    await queryRunner.query(`DROP TABLE "favorite_collection"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_08ef9f51b1b00a726fc8561417"`,
    );
    await queryRunner.query(`DROP TABLE "collection"`);
  }
}
