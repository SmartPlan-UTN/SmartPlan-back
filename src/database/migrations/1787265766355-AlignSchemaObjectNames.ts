import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignSchemaObjectNames1787265766355 implements MigrationInterface {
  name = 'AlignSchemaObjectNames1787265766355';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "collection" DROP CONSTRAINT "FK_d4d9153c07e6bcb5f44bd6b6a63"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection" DROP CONSTRAINT "FK_f4b383fc5bef129e17f10a59cd6"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection" DROP CONSTRAINT "FK_7e20051c451f32db54c07fc8f5a"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail" DROP CONSTRAINT "FK_dd25123bdedc668a662f76fb403"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail" DROP CONSTRAINT "FK_07245e38f74f8bf33e026be62a2"
        `);
    await queryRunner.query(`
            ALTER TABLE "city" DROP CONSTRAINT "FK_3c8eee9bb03a8230c42c7065d0e"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place" DROP CONSTRAINT "FK_f6182fa5efe3c0855c8f707f681"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place" DROP CONSTRAINT "FK_15676e006b77a2dd45d41485d34"
        `);
    await queryRunner.query(`
            ALTER TABLE "place" DROP CONSTRAINT "FK_eeae9a2142d385ea02fd3c7a3ae"
        `);
    await queryRunner.query(`
            ALTER TABLE "department" DROP CONSTRAINT "FK_232d8c44f73877aae73d92b30a9"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_category" DROP CONSTRAINT "FK_19e0e77fa5d50a1fe2d419602db"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_category" DROP CONSTRAINT "FK_8040832780f57d18c6c4bfd6e47"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_preference" DROP CONSTRAINT "FK_c7daba32696513232c01cc59e7c"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_preference" DROP CONSTRAINT "FK_6d2b257030cf85a905f78e85a7a"
        `);
    await queryRunner.query(`
            ALTER TABLE "category" DROP CONSTRAINT "FK_5c37f6d38c6b5e1b81a741b9e6d"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request_category" DROP CONSTRAINT "FK_52e9d1ab1e8a0c4ece4406e3e67"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request_category" DROP CONSTRAINT "FK_9e2be8a9b1c46e4e9f237b0d6e8"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "FK_40f26bd56bceb0276b669c48cd1"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "FK_f8f4fe8c9b57288f877c278936b"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "FK_7cbe8f2c699a6024f1797774d79"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "FK_401ec6171e761eec3847fe273f4"
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback" DROP CONSTRAINT "FK_7d624469c911039cbaf71303190"
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback" DROP CONSTRAINT "FK_74e745209a7dca782d686b979e9"
        `);
    await queryRunner.query(`
            ALTER TABLE "rating" DROP CONSTRAINT "FK_b7026ff0010fc811de47515f06d"
        `);
    await queryRunner.query(`
            ALTER TABLE "rating" DROP CONSTRAINT "FK_64578a948cf3df0f4cc7a75cab8"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_activity" DROP CONSTRAINT "FK_9849f202beb0fa254246d77916f"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_activity" DROP CONSTRAINT "FK_9e21a56330dfeb412da389a65e7"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_list" DROP CONSTRAINT "FK_5a832cc77082dff4c28faba69a6"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_plan" DROP CONSTRAINT "FK_066d076a1233db03093782801e0"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_plan" DROP CONSTRAINT "FK_5bb523c3b2456434eeef983e5b9"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan" DROP CONSTRAINT "FK_9bfe6d6892ae920b93b6d956993"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan" DROP CONSTRAINT "FK_546795495ad705dcf902629152f"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan" DROP CONSTRAINT "FK_6384e79e4065feae287e2187d80"
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permission" DROP CONSTRAINT "FK_9c0fd212b970f71bf0a9465c4f3"
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permission" DROP CONSTRAINT "FK_1d9e5be3d74310f98e398912d94"
        `);
    await queryRunner.query(`
            ALTER TABLE "user" DROP CONSTRAINT "FK_b76cd72443a8aafe1219a390d7b"
        `);
    await queryRunner.query(`
            ALTER TABLE "user" DROP CONSTRAINT "FK_3628e9894c4b014d61a01cb21dd"
        `);
    await queryRunner.query(`
            ALTER TABLE "external_sync" DROP CONSTRAINT "FK_156bef31aed1f91c014999c4137"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_session" DROP CONSTRAINT "FK_b73ffa9c87c0e22796dc828e07a"
        `);
    await queryRunner.query(`
            ALTER TABLE "password_recovery" DROP CONSTRAINT "FK_c841789ba8eb2255d21016d20b9"
        `);
    await queryRunner.query(`
            ALTER TABLE "notification" DROP CONSTRAINT "FK_4fcdca2522991d21d8043089a48"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_335d4183f28956056a04fa1339"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f4b383fc5bef129e17f10a59cd"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_0299d0efa647d33cd013ffa364"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_dd25123bdedc668a662f76fb40"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d0588c85aa20b6861de0f62c14"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_29ed8f24549ed233d89651fa06"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_803c3018fcec4428e4cdc89d05"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c7fe4a6720cc07a2978e9a443f"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f6182fa5efe3c0855c8f707f68"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_4fd14e6b18a073b79d17c3e9ce"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ccf26f263f785181f440ab9391"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_4f91b1efc5cf17b1146093b85e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_eeae9a2142d385ea02fd3c7a3a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_28fb66df9848646a5cdd4219fd"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9eda27a2d475f41b50ae392a1a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_19e0e77fa5d50a1fe2d419602d"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a78a0bd3bc2ff158e5fcc38c7d"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c7daba32696513232c01cc59e7"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_93c3807a3bac0c831c317eb392"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_47630d3deddd9c2be78a568fc6"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_df5055376f092511f55cc1f0bc"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5c37f6d38c6b5e1b81a741b9e6"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_52e9d1ab1e8a0c4ece4406e3e6"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_071a57810a0b7db794e4600e4c"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a5ddcad58aa0ab84bfe2dbbcd7"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_40f26bd56bceb0276b669c48cd"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_401ec6171e761eec3847fe273f"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_2cd76349be2f7de4f17c574f9f"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_7cbe8f2c699a6024f1797774d7"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_f8f4fe8c9b57288f877c278936"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_74e745209a7dca782d686b979e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_7d624469c911039cbaf7130319"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b7026ff0010fc811de47515f06"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_64578a948cf3df0f4cc7a75cab"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1245dbcfdd036eb3258452cba4"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9849f202beb0fa254246d77916"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_7cf25f0be7dfdf429756d45da5"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1e451fbe685de976eac68a6d3b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_066d076a1233db03093782801e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_8405127591675c1c4f9ba6514a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_dcd515d5422e9b41a414e0cfe5"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9bfe6d6892ae920b93b6d95699"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_6384e79e4065feae287e2187d8"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_546795495ad705dcf902629152"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_212c68435545eb3c5863b9993e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5f3b591d112e53d40884760dbc"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9c0fd212b970f71bf0a9465c4f"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9fe4e366696bfc371bb7c5d776"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a34daca1ffe7e1818525cd68c4"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_497f2bf34567f8d20bfc917a9a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3628e9894c4b014d61a01cb21d"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b76cd72443a8aafe1219a390d7"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5e38f7470100498d2f32ce8c25"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_156bef31aed1f91c014999c413"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a6e9b19986f8ea90f34728eb12"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b73ffa9c87c0e22796dc828e07"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_e37a5ef3162c2d4192d79ac465"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3a1178d9d1997bb54807eb0fef"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c841789ba8eb2255d21016d20b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3d6ba5f53f98a8f8464178e8c6"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_da2757ea50d5c42bdb446185b5"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9a2d057150a7a8d5435f4e9610"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9858e3462bc92a70cdef784807"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_4fcdca2522991d21d8043089a4"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "CHK_5dc988ce27e6f02da73c4e0c26"
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_eddaacf59776b7a807dfda4f26" ON "favorite_collection" ("id_activity")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_86d830670d3b0b44a625e433bb" ON "favorite_collection" ("id_collection", "id_activity")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_8d70af976c0598c61bc6705e88" ON "plan_detail" ("id_activity")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_790bed023bc91418a3972b564b" ON "plan_detail" ("id_plan", "order")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_abdd6449363e309455d948c8e4" ON "feedback_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_290058c5e6a2026e59ccadaf6e" ON "country" ("name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_be676cb6e1c586b738ed09d4e4" ON "city" ("id_country", "name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_847e54a8d3c4d7b6657c479e80" ON "activity_place" ("id_place")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_1e7627cd9ed9426110c74f8e4a" ON "activity_place" ("latitude", "longitude")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e737d2fcd000f7a38eb9d09436" ON "activity_place" ("id_activity", "id_place")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_493d5e591af774a1587d363fb8" ON "place" ("name")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a5b94c9a175414243ee7e98a92" ON "place" ("id_department")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_6e9bc44724b72646f0f2571158" ON "department" ("id_city", "name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_0ec539907c15fb8bf964941f49" ON "request_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9af3fb7cfedb1b69f83ff88ea2" ON "activity_category" ("id_category")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_687f244e78af9d85fed2ea1727" ON "activity_category" ("id_activity", "id_category")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_aead4bcefd72f4096768235fe2" ON "user_preference" ("id_category")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_41d933a4d2bedbc095375fd501" ON "user_preference" ("id_user", "id_category")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_c915fbdb440e68d8456b14ab63" ON "category_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_d33abebaa7dad62b5695385aa2" ON "category" ("name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_594f925a1375f48c9b6cea0d47" ON "category" ("id_category_status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_0c5bebce2c2ad5c721e8c2e608" ON "plan_request_category" ("id_category")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_737005e87d8fb21fd7c7dfb791" ON "plan_request_category" ("id_plan_request", "id_category")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_c9bf58bc12c00311b5bccf606b" ON "outing_type" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a62b564e4aaf829dbe6e4eba9b" ON "plan_request" ("id_user")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_aaa887b443a1b79d99a28bca04" ON "plan_request" ("id_department")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c8b05169f54edc259107161773" ON "plan_request" ("requested_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a3073e4d800bbcaafa89a8da1f" ON "plan_request" ("id_outing_type")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_962e345073b3ce77512f3d2b1b" ON "plan_request" ("id_request_status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_5afd8f4854a99c7e1bced77fa0" ON "feedback" ("id_plan_request")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_d4ba45564dde34e1645d59f4f2" ON "feedback" ("id_feedback_status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_84c5b463e91da4d0a59198d829" ON "rating" ("id_activity")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_894e73982699f6bc5a20ab0c30" ON "rating" ("id_feedback")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_e0098522faf604f4f29ba54bba" ON "activity" ("name")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a3421276afdf416ce3b7f18d7e" ON "favorite_activity" ("id_activity")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_ebe09b3615ef90f4faf3d155a3" ON "favorite_activity" ("id_favorite_list", "id_activity")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_1c5f1440a4fe044d9ac341de2d" ON "favorite_list" ("id_user")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a2a42cd3e56ac76a7a75935462" ON "favorite_plan" ("id_plan")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_db82c964589f17d1add51a57e9" ON "favorite_plan" ("id_favorite_list", "id_plan")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_1c4a23db026ef4d9fa61826838" ON "plan_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_817fa32cb3021dc2a1dff5a257" ON "plan" ("id_user")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9179b370165f41d24656eebf15" ON "plan" ("id_plan_request")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_260a48db09e6cf1f0a30c09b2d" ON "plan" ("id_plan_status")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_2866a10f50d07972a1da12e875" ON "user_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_5d633cd0453ef3c66394c72945" ON "permission" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_0f35e0a93838653f6897b4a027" ON "role_permission" ("id_permission")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_d7ced4e28814b528d0ce82e095" ON "role_permission" ("id_role", "id_permission")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_52668bfcdca81cf2efff841d23" ON "role" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_056bb4c824391d82acd9251aef" ON "user" ("email")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_1a3abee4bf37fa00ebd698cede" ON "user" ("id_role")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_eb05b8c46c1cfcafc06a95c1b0" ON "user" ("id_user_status")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a6f8e54abaedd200cf2313eace" ON "external_provider" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_6904aead17f7d9d8e5616d25e9" ON "external_sync" ("id_external_provider")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_3341604ca272561529d5b766f1" ON "external_sync" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_021d604169e4353aea74602898" ON "user_session" ("id_user")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_9ccf6d901cef4067214284f327" ON "user_session" ("token_hash")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_b1652d315367a10a8e0d6f7962" ON "user_session" ("active")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_322ba10d822536cb4a19551a9c" ON "password_recovery" ("id_user")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_48cd92ec22bfb4dd7aec0c5e34" ON "password_recovery" ("token_hash")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_3c5f4aabf897b26e041c7f5ae9" ON "system_parameter" ("name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_951e6339a77994dfbad976b35c" ON "audit_log" ("action")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_89808b8678170a10b3467369a1" ON "audit_log" ("affected_entity", "id_affected_entity")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_faae232c811e023f462f7a1f7c" ON "notification" ("id_user")
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection"
            ADD CONSTRAINT "CHK_bfd1a871693e8add3723f82c19" CHECK (
                    "order" IS NULL
                    OR "order" > 0
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail"
            ADD CONSTRAINT "CHK_f1aaf4a71b55e18fa8ef865ddc" CHECK ("estimated_duration" >= 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail"
            ADD CONSTRAINT "CHK_79ceb8e01a45a9010167f4b118" CHECK ("estimated_cost" >= 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail"
            ADD CONSTRAINT "CHK_d2822ad17164302dcc8ecb18eb" CHECK ("order" > 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place"
            ADD CONSTRAINT "CHK_93b3f3f06e527878ed3c4b1c83" CHECK (
                    (
                        "latitude" IS NULL
                        AND "longitude" IS NULL
                    )
                    OR (
                        "latitude" IS NOT NULL
                        AND "longitude" IS NOT NULL
                    )
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place"
            ADD CONSTRAINT "CHK_e351355ce206a8a9bc3b8376b7" CHECK (
                    "longitude" IS NULL
                    OR "longitude" BETWEEN -180 AND 180
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place"
            ADD CONSTRAINT "CHK_8d7797f4ea89f285602bf0581e" CHECK (
                    "latitude" IS NULL
                    OR "latitude" BETWEEN -90 AND 90
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "CHK_6d4e2de64d1ee96d8b0decab06" CHECK ("available_duration" > 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "CHK_5df272fb239f131373f1911ffe" CHECK ("budget" >= 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback"
            ADD CONSTRAINT "CHK_28829ec5b947ec98b5b9bca62a" CHECK (
                    "actual_duration" IS NULL
                    OR "actual_duration" >= 0
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback"
            ADD CONSTRAINT "CHK_cc3c345cedcd9beed043882d91" CHECK (
                    "actual_cost" IS NULL
                    OR "actual_cost" >= 0
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "rating"
            ADD CONSTRAINT "CHK_87baa812ea06d6aa64dca50dfa" CHECK (
                    "puntaje" BETWEEN 1 AND 5
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "activity"
            ADD CONSTRAINT "CHK_dc158e0c81ab3f29e5f71bb3e9" CHECK ("estimated_duration" > 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "activity"
            ADD CONSTRAINT "CHK_147a9ed2c8c3485f276c632b94" CHECK ("estimated_cost" >= 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "plan"
            ADD CONSTRAINT "CHK_f297398936e6d07ff18b222385" CHECK ("estimated_total_duration" >= 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "plan"
            ADD CONSTRAINT "CHK_b1cdbfd78ad6ce6459ad86df0c" CHECK ("estimated_total_cost" >= 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "external_sync"
            ADD CONSTRAINT "CHK_f4fbee0d1e0d7a71442185be44" CHECK ("record_count" >= 0)
        `);
    await queryRunner.query(`
            ALTER TABLE "collection"
            ADD CONSTRAINT "FK_a156157b092cd09e65786f78bb6" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection"
            ADD CONSTRAINT "FK_cd49cc223830fc33857b6539425" FOREIGN KEY ("id_collection") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection"
            ADD CONSTRAINT "FK_eddaacf59776b7a807dfda4f267" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail"
            ADD CONSTRAINT "FK_5f85b07722b2911f31d861558f0" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail"
            ADD CONSTRAINT "FK_8d70af976c0598c61bc6705e881" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "city"
            ADD CONSTRAINT "FK_d7b1033841f8dae54fb5f831e85" FOREIGN KEY ("id_country") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place"
            ADD CONSTRAINT "FK_b196716c659700eea3a3fe11471" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place"
            ADD CONSTRAINT "FK_847e54a8d3c4d7b6657c479e808" FOREIGN KEY ("id_place") REFERENCES "place"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "place"
            ADD CONSTRAINT "FK_a5b94c9a175414243ee7e98a928" FOREIGN KEY ("id_department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "department"
            ADD CONSTRAINT "FK_2470d8b786b68a00379ecc9b56e" FOREIGN KEY ("id_city") REFERENCES "city"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_category"
            ADD CONSTRAINT "FK_538996be20254429375fef4f160" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_category"
            ADD CONSTRAINT "FK_9af3fb7cfedb1b69f83ff88ea2a" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_preference"
            ADD CONSTRAINT "FK_929bf880ac79d924c4596d16834" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_preference"
            ADD CONSTRAINT "FK_aead4bcefd72f4096768235fe24" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "category"
            ADD CONSTRAINT "FK_594f925a1375f48c9b6cea0d47e" FOREIGN KEY ("id_category_status") REFERENCES "category_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request_category"
            ADD CONSTRAINT "FK_5bc75b9906570e51cf7c765afc0" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request_category"
            ADD CONSTRAINT "FK_0c5bebce2c2ad5c721e8c2e608b" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "FK_a62b564e4aaf829dbe6e4eba9b9" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "FK_aaa887b443a1b79d99a28bca043" FOREIGN KEY ("id_department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "FK_a3073e4d800bbcaafa89a8da1fb" FOREIGN KEY ("id_outing_type") REFERENCES "outing_type"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "FK_962e345073b3ce77512f3d2b1b9" FOREIGN KEY ("id_request_status") REFERENCES "request_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback"
            ADD CONSTRAINT "FK_5afd8f4854a99c7e1bced77fa04" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback"
            ADD CONSTRAINT "FK_d4ba45564dde34e1645d59f4f29" FOREIGN KEY ("id_feedback_status") REFERENCES "feedback_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "rating"
            ADD CONSTRAINT "FK_84c5b463e91da4d0a59198d829b" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "rating"
            ADD CONSTRAINT "FK_894e73982699f6bc5a20ab0c306" FOREIGN KEY ("id_feedback") REFERENCES "feedback"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_activity"
            ADD CONSTRAINT "FK_8a996055d1459c12d48b9720a58" FOREIGN KEY ("id_favorite_list") REFERENCES "favorite_list"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_activity"
            ADD CONSTRAINT "FK_a3421276afdf416ce3b7f18d7ee" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_list"
            ADD CONSTRAINT "FK_25291881fcd9d69b815fd062081" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_plan"
            ADD CONSTRAINT "FK_d2f0d233e73705b9e8b0fde1f55" FOREIGN KEY ("id_favorite_list") REFERENCES "favorite_list"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_plan"
            ADD CONSTRAINT "FK_a2a42cd3e56ac76a7a75935462b" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan"
            ADD CONSTRAINT "FK_817fa32cb3021dc2a1dff5a2574" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan"
            ADD CONSTRAINT "FK_9179b370165f41d24656eebf15d" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan"
            ADD CONSTRAINT "FK_260a48db09e6cf1f0a30c09b2d2" FOREIGN KEY ("id_plan_status") REFERENCES "plan_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permission"
            ADD CONSTRAINT "FK_138a98e6fa0df562f107835eb49" FOREIGN KEY ("id_role") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permission"
            ADD CONSTRAINT "FK_0f35e0a93838653f6897b4a0274" FOREIGN KEY ("id_permission") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "FK_1a3abee4bf37fa00ebd698cedec" FOREIGN KEY ("id_role") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "FK_eb05b8c46c1cfcafc06a95c1b0f" FOREIGN KEY ("id_user_status") REFERENCES "user_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "external_sync"
            ADD CONSTRAINT "FK_6904aead17f7d9d8e5616d25e91" FOREIGN KEY ("id_external_provider") REFERENCES "external_provider"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_session"
            ADD CONSTRAINT "FK_021d604169e4353aea746028985" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "password_recovery"
            ADD CONSTRAINT "FK_322ba10d822536cb4a19551a9c3" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "notification"
            ADD CONSTRAINT "FK_faae232c811e023f462f7a1f7c5" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e4feb227b5fc4c0a47b7016444" ON "collection" ("id_user", "name")
            WHERE "deleted_at" IS NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "notification" DROP CONSTRAINT "FK_faae232c811e023f462f7a1f7c5"
        `);
    await queryRunner.query(`
            ALTER TABLE "password_recovery" DROP CONSTRAINT "FK_322ba10d822536cb4a19551a9c3"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_session" DROP CONSTRAINT "FK_021d604169e4353aea746028985"
        `);
    await queryRunner.query(`
            ALTER TABLE "external_sync" DROP CONSTRAINT "FK_6904aead17f7d9d8e5616d25e91"
        `);
    await queryRunner.query(`
            ALTER TABLE "user" DROP CONSTRAINT "FK_eb05b8c46c1cfcafc06a95c1b0f"
        `);
    await queryRunner.query(`
            ALTER TABLE "user" DROP CONSTRAINT "FK_1a3abee4bf37fa00ebd698cedec"
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permission" DROP CONSTRAINT "FK_0f35e0a93838653f6897b4a0274"
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permission" DROP CONSTRAINT "FK_138a98e6fa0df562f107835eb49"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan" DROP CONSTRAINT "FK_260a48db09e6cf1f0a30c09b2d2"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan" DROP CONSTRAINT "FK_9179b370165f41d24656eebf15d"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan" DROP CONSTRAINT "FK_817fa32cb3021dc2a1dff5a2574"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_plan" DROP CONSTRAINT "FK_a2a42cd3e56ac76a7a75935462b"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_plan" DROP CONSTRAINT "FK_d2f0d233e73705b9e8b0fde1f55"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_list" DROP CONSTRAINT "FK_25291881fcd9d69b815fd062081"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_activity" DROP CONSTRAINT "FK_a3421276afdf416ce3b7f18d7ee"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_activity" DROP CONSTRAINT "FK_8a996055d1459c12d48b9720a58"
        `);
    await queryRunner.query(`
            ALTER TABLE "rating" DROP CONSTRAINT "FK_894e73982699f6bc5a20ab0c306"
        `);
    await queryRunner.query(`
            ALTER TABLE "rating" DROP CONSTRAINT "FK_84c5b463e91da4d0a59198d829b"
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback" DROP CONSTRAINT "FK_d4ba45564dde34e1645d59f4f29"
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback" DROP CONSTRAINT "FK_5afd8f4854a99c7e1bced77fa04"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "FK_962e345073b3ce77512f3d2b1b9"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "FK_a3073e4d800bbcaafa89a8da1fb"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "FK_aaa887b443a1b79d99a28bca043"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "FK_a62b564e4aaf829dbe6e4eba9b9"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request_category" DROP CONSTRAINT "FK_0c5bebce2c2ad5c721e8c2e608b"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request_category" DROP CONSTRAINT "FK_5bc75b9906570e51cf7c765afc0"
        `);
    await queryRunner.query(`
            ALTER TABLE "category" DROP CONSTRAINT "FK_594f925a1375f48c9b6cea0d47e"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_preference" DROP CONSTRAINT "FK_aead4bcefd72f4096768235fe24"
        `);
    await queryRunner.query(`
            ALTER TABLE "user_preference" DROP CONSTRAINT "FK_929bf880ac79d924c4596d16834"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_category" DROP CONSTRAINT "FK_9af3fb7cfedb1b69f83ff88ea2a"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_category" DROP CONSTRAINT "FK_538996be20254429375fef4f160"
        `);
    await queryRunner.query(`
            ALTER TABLE "department" DROP CONSTRAINT "FK_2470d8b786b68a00379ecc9b56e"
        `);
    await queryRunner.query(`
            ALTER TABLE "place" DROP CONSTRAINT "FK_a5b94c9a175414243ee7e98a928"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place" DROP CONSTRAINT "FK_847e54a8d3c4d7b6657c479e808"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place" DROP CONSTRAINT "FK_b196716c659700eea3a3fe11471"
        `);
    await queryRunner.query(`
            ALTER TABLE "city" DROP CONSTRAINT "FK_d7b1033841f8dae54fb5f831e85"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail" DROP CONSTRAINT "FK_8d70af976c0598c61bc6705e881"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail" DROP CONSTRAINT "FK_5f85b07722b2911f31d861558f0"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection" DROP CONSTRAINT "FK_eddaacf59776b7a807dfda4f267"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection" DROP CONSTRAINT "FK_cd49cc223830fc33857b6539425"
        `);
    await queryRunner.query(`
            ALTER TABLE "collection" DROP CONSTRAINT "FK_a156157b092cd09e65786f78bb6"
        `);
    await queryRunner.query(`
            ALTER TABLE "external_sync" DROP CONSTRAINT "CHK_f4fbee0d1e0d7a71442185be44"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan" DROP CONSTRAINT "CHK_b1cdbfd78ad6ce6459ad86df0c"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan" DROP CONSTRAINT "CHK_f297398936e6d07ff18b222385"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity" DROP CONSTRAINT "CHK_147a9ed2c8c3485f276c632b94"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity" DROP CONSTRAINT "CHK_dc158e0c81ab3f29e5f71bb3e9"
        `);
    await queryRunner.query(`
            ALTER TABLE "rating" DROP CONSTRAINT "CHK_87baa812ea06d6aa64dca50dfa"
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback" DROP CONSTRAINT "CHK_cc3c345cedcd9beed043882d91"
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback" DROP CONSTRAINT "CHK_28829ec5b947ec98b5b9bca62a"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "CHK_5df272fb239f131373f1911ffe"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request" DROP CONSTRAINT "CHK_6d4e2de64d1ee96d8b0decab06"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place" DROP CONSTRAINT "CHK_8d7797f4ea89f285602bf0581e"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place" DROP CONSTRAINT "CHK_e351355ce206a8a9bc3b8376b7"
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place" DROP CONSTRAINT "CHK_93b3f3f06e527878ed3c4b1c83"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail" DROP CONSTRAINT "CHK_d2822ad17164302dcc8ecb18eb"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail" DROP CONSTRAINT "CHK_79ceb8e01a45a9010167f4b118"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail" DROP CONSTRAINT "CHK_f1aaf4a71b55e18fa8ef865ddc"
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection" DROP CONSTRAINT "CHK_bfd1a871693e8add3723f82c19"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_faae232c811e023f462f7a1f7c"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_89808b8678170a10b3467369a1"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_951e6339a77994dfbad976b35c"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3c5f4aabf897b26e041c7f5ae9"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_48cd92ec22bfb4dd7aec0c5e34"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_322ba10d822536cb4a19551a9c"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_b1652d315367a10a8e0d6f7962"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9ccf6d901cef4067214284f327"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_021d604169e4353aea74602898"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_3341604ca272561529d5b766f1"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_6904aead17f7d9d8e5616d25e9"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a6f8e54abaedd200cf2313eace"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_eb05b8c46c1cfcafc06a95c1b0"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1a3abee4bf37fa00ebd698cede"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_056bb4c824391d82acd9251aef"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_52668bfcdca81cf2efff841d23"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d7ced4e28814b528d0ce82e095"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_0f35e0a93838653f6897b4a027"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5d633cd0453ef3c66394c72945"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_2866a10f50d07972a1da12e875"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_260a48db09e6cf1f0a30c09b2d"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9179b370165f41d24656eebf15"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_817fa32cb3021dc2a1dff5a257"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1c4a23db026ef4d9fa61826838"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_db82c964589f17d1add51a57e9"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a2a42cd3e56ac76a7a75935462"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1c5f1440a4fe044d9ac341de2d"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ebe09b3615ef90f4faf3d155a3"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a3421276afdf416ce3b7f18d7e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_e0098522faf604f4f29ba54bba"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_894e73982699f6bc5a20ab0c30"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_84c5b463e91da4d0a59198d829"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d4ba45564dde34e1645d59f4f2"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_5afd8f4854a99c7e1bced77fa0"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_962e345073b3ce77512f3d2b1b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a3073e4d800bbcaafa89a8da1f"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c8b05169f54edc259107161773"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_aaa887b443a1b79d99a28bca04"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a62b564e4aaf829dbe6e4eba9b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c9bf58bc12c00311b5bccf606b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_737005e87d8fb21fd7c7dfb791"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_0c5bebce2c2ad5c721e8c2e608"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_594f925a1375f48c9b6cea0d47"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_d33abebaa7dad62b5695385aa2"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c915fbdb440e68d8456b14ab63"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_41d933a4d2bedbc095375fd501"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_aead4bcefd72f4096768235fe2"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_687f244e78af9d85fed2ea1727"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_9af3fb7cfedb1b69f83ff88ea2"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_0ec539907c15fb8bf964941f49"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_6e9bc44724b72646f0f2571158"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_a5b94c9a175414243ee7e98a92"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_493d5e591af774a1587d363fb8"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_e737d2fcd000f7a38eb9d09436"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_1e7627cd9ed9426110c74f8e4a"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_847e54a8d3c4d7b6657c479e80"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_be676cb6e1c586b738ed09d4e4"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_290058c5e6a2026e59ccadaf6e"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_abdd6449363e309455d948c8e4"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_790bed023bc91418a3972b564b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_8d70af976c0598c61bc6705e88"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_86d830670d3b0b44a625e433bb"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_eddaacf59776b7a807dfda4f26"
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "CHK_5dc988ce27e6f02da73c4e0c26" CHECK ((available_duration > 0))
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_4fcdca2522991d21d8043089a4" ON "notification" ("id_user")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9858e3462bc92a70cdef784807" ON "audit_log" ("affected_entity", "id_affected_entity")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9a2d057150a7a8d5435f4e9610" ON "audit_log" ("action")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_ef77b3eef2ab3ce4c29f891f1c" ON "system_parameter" ("name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_3d6ba5f53f98a8f8464178e8c6" ON "password_recovery" ("token_hash")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c841789ba8eb2255d21016d20b" ON "password_recovery" ("id_user")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_3a1178d9d1997bb54807eb0fef" ON "user_session" ("active")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e37a5ef3162c2d4192d79ac465" ON "user_session" ("token_hash")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_b73ffa9c87c0e22796dc828e07" ON "user_session" ("id_user")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_a6e9b19986f8ea90f34728eb12" ON "external_sync" ("status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_156bef31aed1f91c014999c413" ON "external_sync" ("id_external_provider")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_3a6126aff629a4e63bd7aadcf6" ON "external_provider" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_b76cd72443a8aafe1219a390d7" ON "user" ("id_user_status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_3628e9894c4b014d61a01cb21d" ON "user" ("id_role")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_2863682842e688ca198eb25c12" ON "user" ("email")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_c5bf682cf2cee2f563b3335f11" ON "role" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e4b93a459f7547fb440e3325f8" ON "role_permission" ("id_role", "id_permission")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9c0fd212b970f71bf0a9465c4f" ON "role_permission" ("id_permission")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a0840f2e5f809aca7e9d0e4908" ON "permission" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_6d2f2cd3ddfab61cd330f1a890" ON "user_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_546795495ad705dcf902629152" ON "plan" ("id_plan_status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_6384e79e4065feae287e2187d8" ON "plan" ("id_plan_request")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9bfe6d6892ae920b93b6d95699" ON "plan" ("id_user")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_ed46a4c033e179d7be668b3903" ON "plan_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_26d245e6f8ff582f27d36de075" ON "favorite_plan" ("id_favorite_list", "id_plan")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_066d076a1233db03093782801e" ON "favorite_plan" ("id_plan")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_5a832cc77082dff4c28faba69a" ON "favorite_list" ("id_user")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_9dab8b145701f68e39c88133de" ON "favorite_activity" ("id_favorite_list", "id_activity")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_9849f202beb0fa254246d77916" ON "favorite_activity" ("id_activity")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_1245dbcfdd036eb3258452cba4" ON "activity" ("name")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_64578a948cf3df0f4cc7a75cab" ON "rating" ("id_feedback")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_b7026ff0010fc811de47515f06" ON "rating" ("id_activity")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_7d624469c911039cbaf7130319" ON "feedback" ("id_feedback_status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_74e745209a7dca782d686b979e" ON "feedback" ("id_plan_request")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f8f4fe8c9b57288f877c278936" ON "plan_request" ("id_request_status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_7cbe8f2c699a6024f1797774d7" ON "plan_request" ("id_outing_type")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_2cd76349be2f7de4f17c574f9f" ON "plan_request" ("requested_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_401ec6171e761eec3847fe273f" ON "plan_request" ("id_user")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_40f26bd56bceb0276b669c48cd" ON "plan_request" ("id_department")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_6f90866de93e2ecb9136d9c1f7" ON "outing_type" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_85399d80a6c1828d1c87e8db72" ON "plan_request_category" ("id_plan_request", "id_category")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_52e9d1ab1e8a0c4ece4406e3e6" ON "plan_request_category" ("id_category")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_5c37f6d38c6b5e1b81a741b9e6" ON "category" ("id_category_status")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_6771d90221138c5bf48044fd73" ON "category" ("name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_1a3a74f3d3335abca014e553a0" ON "category_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_1bd8d03a840994db3da2846b4e" ON "user_preference" ("id_user", "id_category")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c7daba32696513232c01cc59e7" ON "user_preference" ("id_category")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_5ebda4671370b8f3453ac416a4" ON "activity_category" ("id_activity", "id_category")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_19e0e77fa5d50a1fe2d419602d" ON "activity_category" ("id_category")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e8ddf670966b656f20d22f24de" ON "request_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_5b08b1b3de216473d838009000" ON "department" ("id_city", "name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_eeae9a2142d385ea02fd3c7a3a" ON "place" ("id_department")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_4f91b1efc5cf17b1146093b85e" ON "place" ("name")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_4c0910cbb32c7b62b7ad6730dc" ON "activity_place" ("id_activity", "id_place")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_4fd14e6b18a073b79d17c3e9ce" ON "activity_place" ("latitude", "longitude")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f6182fa5efe3c0855c8f707f68" ON "activity_place" ("id_place")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_051a4baf95dfb69d3f3d90d04a" ON "city" ("id_country", "name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e879162df254e6f938ad470f89" ON "country" ("name")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_ccd6a704b058e3af7a83125a22" ON "feedback_status" ("key")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_435a39364823e198e6988effbb" ON "plan_detail" ("id_plan", "order")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_dd25123bdedc668a662f76fb40" ON "plan_detail" ("id_activity")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_ecdd1bbc46325b7e6a501e9390" ON "favorite_collection" ("id_collection", "id_activity")
            WHERE "deleted_at" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_f4b383fc5bef129e17f10a59cd" ON "favorite_collection" ("id_activity")
        `);
    await queryRunner.query(`
            ALTER TABLE "notification"
            ADD CONSTRAINT "FK_4fcdca2522991d21d8043089a48" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "password_recovery"
            ADD CONSTRAINT "FK_c841789ba8eb2255d21016d20b9" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_session"
            ADD CONSTRAINT "FK_b73ffa9c87c0e22796dc828e07a" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "external_sync"
            ADD CONSTRAINT "FK_156bef31aed1f91c014999c4137" FOREIGN KEY ("id_external_provider") REFERENCES "external_provider"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "FK_3628e9894c4b014d61a01cb21dd" FOREIGN KEY ("id_role") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user"
            ADD CONSTRAINT "FK_b76cd72443a8aafe1219a390d7b" FOREIGN KEY ("id_user_status") REFERENCES "user_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permission"
            ADD CONSTRAINT "FK_1d9e5be3d74310f98e398912d94" FOREIGN KEY ("id_role") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "role_permission"
            ADD CONSTRAINT "FK_9c0fd212b970f71bf0a9465c4f3" FOREIGN KEY ("id_permission") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan"
            ADD CONSTRAINT "FK_6384e79e4065feae287e2187d80" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan"
            ADD CONSTRAINT "FK_546795495ad705dcf902629152f" FOREIGN KEY ("id_plan_status") REFERENCES "plan_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan"
            ADD CONSTRAINT "FK_9bfe6d6892ae920b93b6d956993" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_plan"
            ADD CONSTRAINT "FK_5bb523c3b2456434eeef983e5b9" FOREIGN KEY ("id_favorite_list") REFERENCES "favorite_list"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_plan"
            ADD CONSTRAINT "FK_066d076a1233db03093782801e0" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_list"
            ADD CONSTRAINT "FK_5a832cc77082dff4c28faba69a6" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_activity"
            ADD CONSTRAINT "FK_9e21a56330dfeb412da389a65e7" FOREIGN KEY ("id_favorite_list") REFERENCES "favorite_list"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_activity"
            ADD CONSTRAINT "FK_9849f202beb0fa254246d77916f" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "rating"
            ADD CONSTRAINT "FK_64578a948cf3df0f4cc7a75cab8" FOREIGN KEY ("id_feedback") REFERENCES "feedback"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "rating"
            ADD CONSTRAINT "FK_b7026ff0010fc811de47515f06d" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback"
            ADD CONSTRAINT "FK_74e745209a7dca782d686b979e9" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "feedback"
            ADD CONSTRAINT "FK_7d624469c911039cbaf71303190" FOREIGN KEY ("id_feedback_status") REFERENCES "feedback_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "FK_401ec6171e761eec3847fe273f4" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "FK_7cbe8f2c699a6024f1797774d79" FOREIGN KEY ("id_outing_type") REFERENCES "outing_type"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "FK_f8f4fe8c9b57288f877c278936b" FOREIGN KEY ("id_request_status") REFERENCES "request_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request"
            ADD CONSTRAINT "FK_40f26bd56bceb0276b669c48cd1" FOREIGN KEY ("id_department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request_category"
            ADD CONSTRAINT "FK_9e2be8a9b1c46e4e9f237b0d6e8" FOREIGN KEY ("id_plan_request") REFERENCES "plan_request"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_request_category"
            ADD CONSTRAINT "FK_52e9d1ab1e8a0c4ece4406e3e67" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "category"
            ADD CONSTRAINT "FK_5c37f6d38c6b5e1b81a741b9e6d" FOREIGN KEY ("id_category_status") REFERENCES "category_status"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_preference"
            ADD CONSTRAINT "FK_6d2b257030cf85a905f78e85a7a" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "user_preference"
            ADD CONSTRAINT "FK_c7daba32696513232c01cc59e7c" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_category"
            ADD CONSTRAINT "FK_8040832780f57d18c6c4bfd6e47" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_category"
            ADD CONSTRAINT "FK_19e0e77fa5d50a1fe2d419602db" FOREIGN KEY ("id_category") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "department"
            ADD CONSTRAINT "FK_232d8c44f73877aae73d92b30a9" FOREIGN KEY ("id_city") REFERENCES "city"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "place"
            ADD CONSTRAINT "FK_eeae9a2142d385ea02fd3c7a3ae" FOREIGN KEY ("id_department") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place"
            ADD CONSTRAINT "FK_15676e006b77a2dd45d41485d34" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "activity_place"
            ADD CONSTRAINT "FK_f6182fa5efe3c0855c8f707f681" FOREIGN KEY ("id_place") REFERENCES "place"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "city"
            ADD CONSTRAINT "FK_3c8eee9bb03a8230c42c7065d0e" FOREIGN KEY ("id_country") REFERENCES "country"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail"
            ADD CONSTRAINT "FK_07245e38f74f8bf33e026be62a2" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "plan_detail"
            ADD CONSTRAINT "FK_dd25123bdedc668a662f76fb403" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection"
            ADD CONSTRAINT "FK_7e20051c451f32db54c07fc8f5a" FOREIGN KEY ("id_collection") REFERENCES "collection"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "favorite_collection"
            ADD CONSTRAINT "FK_f4b383fc5bef129e17f10a59cd6" FOREIGN KEY ("id_activity") REFERENCES "activity"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "collection"
            ADD CONSTRAINT "FK_d4d9153c07e6bcb5f44bd6b6a63" FOREIGN KEY ("id_user") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_e4feb227b5fc4c0a47b7016444"
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_335d4183f28956056a04fa1339" ON "collection" ("id_user", "name")
            WHERE "deleted_at" IS NULL
        `);
  }
}
