import { MigrationInterface, QueryRunner } from 'typeorm';

export class EsquemaInicial1786813686268 implements MigrationInterface {
  name = 'EsquemaInicial1786813686268';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "actividad_favorito" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_lista_favorito" integer NOT NULL, "id_actividad" integer NOT NULL, CONSTRAINT "PK_4014c8e6a35d2f4354018ff4f93" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9849f202beb0fa254246d77916" ON "actividad_favorito" ("id_actividad") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7cf25f0be7dfdf429756d45da5" ON "actividad_favorito" ("id_lista_favorito", "id_actividad") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "lista_favorito" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_usuario" integer NOT NULL, CONSTRAINT "PK_2166b233d30443474a314ae1b6f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_1e451fbe685de976eac68a6d3b" ON "lista_favorito" ("id_usuario") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "plan_favorito" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_lista_favorito" integer NOT NULL, "id_plan" integer NOT NULL, CONSTRAINT "PK_64531fb8db30a0c12d7d9dbd06f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_066d076a1233db03093782801e" ON "plan_favorito" ("id_plan") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8405127591675c1c4f9ba6514a" ON "plan_favorito" ("id_lista_favorito", "id_plan") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "pais" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(100) NOT NULL, "descripcion" text, CONSTRAINT "PK_a362c5bbbefe39c9187406b1917" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_803c3018fcec4428e4cdc89d05" ON "pais" ("nombre") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "ciudad" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_pais" integer NOT NULL, "nombre" character varying(100) NOT NULL, "descripcion" text, CONSTRAINT "PK_cef4e65aef46bbb8598e284d5d3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c7fe4a6720cc07a2978e9a443f" ON "ciudad" ("id_pais", "nombre") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "actividad_lugar" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_actividad" integer NOT NULL, "id_lugar" integer NOT NULL, "latitud" numeric(9,6), "longitud" numeric(9,6), "observaciones" text, CONSTRAINT "CHK_ad3d49894a1d1f61efed07241b" CHECK (("latitud" IS NULL AND "longitud" IS NULL) OR ("latitud" IS NOT NULL AND "longitud" IS NOT NULL)), CONSTRAINT "CHK_99b7747ee7bafb339e01a38e6f" CHECK ("longitud" IS NULL OR "longitud" BETWEEN -180 AND 180), CONSTRAINT "CHK_1576e5f92bd48cbce3b174d19d" CHECK ("latitud" IS NULL OR "latitud" BETWEEN -90 AND 90), CONSTRAINT "PK_26c10841859bf078857af2fbadb" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6182fa5efe3c0855c8f707f68" ON "actividad_lugar" ("id_lugar") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4fd14e6b18a073b79d17c3e9ce" ON "actividad_lugar" ("latitud", "longitud") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_ccf26f263f785181f440ab9391" ON "actividad_lugar" ("id_actividad", "id_lugar") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "lugar" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(150) NOT NULL, "descripcion" text, "direccion" character varying(255) NOT NULL, "id_departamento" integer NOT NULL, CONSTRAINT "PK_47ec82e48b2972979967059ed8f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4f91b1efc5cf17b1146093b85e" ON "lugar" ("nombre") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eeae9a2142d385ea02fd3c7a3a" ON "lugar" ("id_departamento") `,
    );
    await queryRunner.query(
      `CREATE TABLE "departamento" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_ciudad" integer NOT NULL, "nombre" character varying(100) NOT NULL, "descripcion" text, CONSTRAINT "PK_7fd6f336280fd0c7a9318464723" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_28fb66df9848646a5cdd4219fd" ON "departamento" ("id_ciudad", "nombre") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "estado_solicitud" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), CONSTRAINT "PK_5df4af016411b81a065f4d71fc5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9eda27a2d475f41b50ae392a1a" ON "estado_solicitud" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "actividad_categoria" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_actividad" integer NOT NULL, "id_categoria" integer NOT NULL, CONSTRAINT "PK_17c942562bc9fbd39c09fe200b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_19e0e77fa5d50a1fe2d419602d" ON "actividad_categoria" ("id_categoria") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a78a0bd3bc2ff158e5fcc38c7d" ON "actividad_categoria" ("id_actividad", "id_categoria") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "preferencia_usuario" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_usuario" integer NOT NULL, "id_categoria" integer NOT NULL, CONSTRAINT "PK_d4ea3d79f483016302c7ba870bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c7daba32696513232c01cc59e7" ON "preferencia_usuario" ("id_categoria") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_93c3807a3bac0c831c317eb392" ON "preferencia_usuario" ("id_usuario", "id_categoria") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "estado_categoria" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), CONSTRAINT "PK_ccc6e98b3e3643829e668cb028a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_47630d3deddd9c2be78a568fc6" ON "estado_categoria" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "categoria" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "descripcion" text, "id_estado_categoria" integer NOT NULL, CONSTRAINT "PK_f027836b77b84fb4c3a374dc70d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_df5055376f092511f55cc1f0bc" ON "categoria" ("nombre") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5c37f6d38c6b5e1b81a741b9e6" ON "categoria" ("id_estado_categoria") `,
    );
    await queryRunner.query(
      `CREATE TABLE "solicitud_plan_categoria" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_solicitud_plan" integer NOT NULL, "id_categoria" integer NOT NULL, "descripcion" text, CONSTRAINT "PK_202bb5dc164ebf3597a4d5ebe58" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_52e9d1ab1e8a0c4ece4406e3e6" ON "solicitud_plan_categoria" ("id_categoria") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_071a57810a0b7db794e4600e4c" ON "solicitud_plan_categoria" ("id_solicitud_plan", "id_categoria") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "tipo_salida" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), CONSTRAINT "PK_1ea6fc4a8d0a62c0a2fb5b67f72" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a5ddcad58aa0ab84bfe2dbbcd7" ON "tipo_salida" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "solicitud_plan" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_usuario" integer NOT NULL, "presupuesto" numeric(10,2) NOT NULL, "id_departamento" integer NOT NULL, "duracion_disponible" integer NOT NULL, "fecha_solicitud" TIMESTAMP WITH TIME ZONE NOT NULL, "id_tipo_salida" integer NOT NULL, "id_estado_solicitud" integer NOT NULL, "observaciones" text, CONSTRAINT "CHK_5dc988ce27e6f02da73c4e0c26" CHECK ("duracion_disponible" > 0), CONSTRAINT "CHK_ef0bd4dbd6ba9313299dc88989" CHECK ("presupuesto" >= 0), CONSTRAINT "PK_a8a37801bd041d88c6313efe0a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_401ec6171e761eec3847fe273f" ON "solicitud_plan" ("id_usuario") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40f26bd56bceb0276b669c48cd" ON "solicitud_plan" ("id_departamento") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2cd76349be2f7de4f17c574f9f" ON "solicitud_plan" ("fecha_solicitud") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7cbe8f2c699a6024f1797774d7" ON "solicitud_plan" ("id_tipo_salida") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8f4fe8c9b57288f877c278936" ON "solicitud_plan" ("id_estado_solicitud") `,
    );
    await queryRunner.query(
      `CREATE TABLE "detalle_plan" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_plan" integer NOT NULL, "id_actividad" integer NOT NULL, "orden" smallint NOT NULL, "costo_estimado" numeric(10,2) NOT NULL DEFAULT '0', "duracion_estimada" integer NOT NULL DEFAULT '0', "observacion" text, CONSTRAINT "CHK_a21e4d24a778de1d633bd47883" CHECK ("duracion_estimada" >= 0), CONSTRAINT "CHK_1f4377a8f4e4657455b90557d3" CHECK ("costo_estimado" >= 0), CONSTRAINT "CHK_0ce782cb62247abde7dddcf0c9" CHECK ("orden" > 0), CONSTRAINT "PK_47adc266c7ed420c00331e50248" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd25123bdedc668a662f76fb40" ON "detalle_plan" ("id_actividad") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d0588c85aa20b6861de0f62c14" ON "detalle_plan" ("id_plan", "orden") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "estado_plan" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), CONSTRAINT "PK_48c9b06070ca2cf43f4a25b10ae" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_dcd515d5422e9b41a414e0cfe5" ON "estado_plan" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "plan" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "titulo" character varying(150) NOT NULL, "descripcion" text, "id_usuario" integer NOT NULL, "id_solicitud_plan" integer, "id_estado_plan" integer NOT NULL, "costo_total_estimado" numeric(10,2) NOT NULL DEFAULT '0', "duracion_total_estimada" integer NOT NULL DEFAULT '0', CONSTRAINT "CHK_ed3b6dd1d17a616d8122fbd654" CHECK ("duracion_total_estimada" >= 0), CONSTRAINT "CHK_a371e83e734139010067424ac9" CHECK ("costo_total_estimado" >= 0), CONSTRAINT "PK_54a2b686aed3b637654bf7ddbb3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9bfe6d6892ae920b93b6d95699" ON "plan" ("id_usuario") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6384e79e4065feae287e2187d8" ON "plan" ("id_solicitud_plan") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_546795495ad705dcf902629152" ON "plan" ("id_estado_plan") `,
    );
    await queryRunner.query(
      `CREATE TABLE "estado_usuario" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), CONSTRAINT "PK_4d2a61526643ff762fa06cb4e35" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_212c68435545eb3c5863b9993e" ON "estado_usuario" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "permiso" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), CONSTRAINT "PK_8f675309c577bd8f4d826994e95" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5f3b591d112e53d40884760dbc" ON "permiso" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "rol_permiso" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_rol" integer NOT NULL, "id_permiso" integer NOT NULL, CONSTRAINT "PK_923e78f63bed9762a5b646f8a7a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9c0fd212b970f71bf0a9465c4f" ON "rol_permiso" ("id_permiso") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_9fe4e366696bfc371bb7c5d776" ON "rol_permiso" ("id_rol", "id_permiso") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "rol" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), CONSTRAINT "PK_c93a22388638fac311781c7f2dd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a34daca1ffe7e1818525cd68c4" ON "rol" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "usuario" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "apellido" character varying(80) NOT NULL, "email" character varying(150) NOT NULL, "password_hash" character varying(255) NOT NULL, "id_rol" integer NOT NULL, "id_estado_usuario" integer NOT NULL, CONSTRAINT "PK_a56c58e5cabaa04fb2c98d2d7e2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_497f2bf34567f8d20bfc917a9a" ON "usuario" ("email") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3628e9894c4b014d61a01cb21d" ON "usuario" ("id_rol") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b76cd72443a8aafe1219a390d7" ON "usuario" ("id_estado_usuario") `,
    );
    await queryRunner.query(
      `CREATE TABLE "coleccion" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_usuario" integer NOT NULL, "nombre_coleccion" character varying(100) NOT NULL, "fecha_guardado" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_e2128b025f7d30b489bc142c879" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_335d4183f28956056a04fa1339" ON "coleccion" ("id_usuario", "nombre_coleccion") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "coleccion_favorito" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_coleccion" integer NOT NULL, "id_actividad" integer NOT NULL, "orden" smallint, CONSTRAINT "CHK_9fac77ef73a8726ba66d78203e" CHECK ("orden" IS NULL OR "orden" > 0), CONSTRAINT "PK_95b2b67d7eaae351cfae513ddca" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f4b383fc5bef129e17f10a59cd" ON "coleccion_favorito" ("id_actividad") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0299d0efa647d33cd013ffa364" ON "coleccion_favorito" ("id_coleccion", "id_actividad") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "actividad" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(150) NOT NULL, "descripcion" text NOT NULL, "costo_estimado" numeric(10,2) NOT NULL, "duracion_estimada" integer NOT NULL, CONSTRAINT "CHK_0fc09bcc459617020d9c9995b5" CHECK ("duracion_estimada" > 0), CONSTRAINT "CHK_c7a6f3c94359e2e33d341ae120" CHECK ("costo_estimado" >= 0), CONSTRAINT "PK_ae34007f8c81abaf44d8992662d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1245dbcfdd036eb3258452cba4" ON "actividad" ("nombre") `,
    );
    await queryRunner.query(
      `CREATE TABLE "estado_retroalimentacion" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), CONSTRAINT "PK_9d179833458267472b6f6b4302b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_29ed8f24549ed233d89651fa06" ON "estado_retroalimentacion" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "retroalimentacion" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "titulo" character varying(150) NOT NULL, "descripcion" text, "costo_real" numeric(10,2), "duracion_real" integer, "id_solicitud_plan" integer NOT NULL, "id_estado_retroalimentacion" integer NOT NULL, CONSTRAINT "CHK_a06b9ac6cfb8c427f1f57f8dbf" CHECK ("duracion_real" IS NULL OR "duracion_real" >= 0), CONSTRAINT "CHK_b6f738baf05b3d2768b31e8ff8" CHECK ("costo_real" IS NULL OR "costo_real" >= 0), CONSTRAINT "PK_212da904fd6cf239be16cfcbeff" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_74e745209a7dca782d686b979e" ON "retroalimentacion" ("id_solicitud_plan") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7d624469c911039cbaf7130319" ON "retroalimentacion" ("id_estado_retroalimentacion") `,
    );
    await queryRunner.query(
      `CREATE TABLE "valoracion" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "puntaje" smallint NOT NULL, "id_actividad" integer NOT NULL, "id_retroalimentacion" integer, CONSTRAINT "CHK_77b89770370bb77f114b740ff1" CHECK ("puntaje" BETWEEN 1 AND 5), CONSTRAINT "PK_f600c62375f0641fa63a03b6114" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b7026ff0010fc811de47515f06" ON "valoracion" ("id_actividad") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_64578a948cf3df0f4cc7a75cab" ON "valoracion" ("id_retroalimentacion") `,
    );
    await queryRunner.query(
      `CREATE TABLE "proveedor_externo" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "key" character varying(40) NOT NULL, "descripcion" character varying(200), "activo" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_20d6892f3dd8480751a120bf2b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_5e38f7470100498d2f32ce8c25" ON "proveedor_externo" ("key") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "sincronizacion_externa" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_proveedor_externo" integer NOT NULL, "entidad" character varying(60) NOT NULL, "estado" character varying(30) NOT NULL, "fecha_inicio" TIMESTAMP WITH TIME ZONE NOT NULL, "fecha_fin" TIMESTAMP WITH TIME ZONE, "cantidad_registros" integer NOT NULL DEFAULT '0', "mensaje_error" text, CONSTRAINT "CHK_a77a4af1be114f6d877cf37c9b" CHECK ("cantidad_registros" >= 0), CONSTRAINT "PK_90d1af6f73a862eb2d06a5f0c47" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_156bef31aed1f91c014999c413" ON "sincronizacion_externa" ("id_proveedor_externo") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a6e9b19986f8ea90f34728eb12" ON "sincronizacion_externa" ("estado") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sesion_usuario" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_usuario" integer NOT NULL, "token_hash" character varying(255) NOT NULL, "fecha_inicio" TIMESTAMP WITH TIME ZONE NOT NULL, "activa" boolean NOT NULL DEFAULT true, "ip" character varying(45), CONSTRAINT "PK_393c4bb28097127f5d2f60b78b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b73ffa9c87c0e22796dc828e07" ON "sesion_usuario" ("id_usuario") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e37a5ef3162c2d4192d79ac465" ON "sesion_usuario" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3a1178d9d1997bb54807eb0fef" ON "sesion_usuario" ("activa") `,
    );
    await queryRunner.query(
      `CREATE TABLE "recuperacion_contrasena" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_usuario" integer NOT NULL, "token_hash" character varying(255) NOT NULL, "fecha_creacion" TIMESTAMP WITH TIME ZONE NOT NULL, "fecha_expiracion" TIMESTAMP WITH TIME ZONE NOT NULL, "usado" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_5342ee6f887adb6a38e929aaffe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c841789ba8eb2255d21016d20b" ON "recuperacion_contrasena" ("id_usuario") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_3d6ba5f53f98a8f8464178e8c6" ON "recuperacion_contrasena" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."registro_auditoria_accion_enum" AS ENUM('crear', 'actualizar', 'eliminar', 'iniciar_sesion', 'cerrar_sesion')`,
    );
    await queryRunner.query(
      `CREATE TABLE "registro_auditoria" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "accion" "public"."registro_auditoria_accion_enum" NOT NULL, "entidad_afectada" character varying(60) NOT NULL, "id_entidad_afectada" integer NOT NULL, "original" jsonb, "cambios" jsonb, CONSTRAINT "PK_cb94111cb3506d0867eeb81f8e6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9a2d057150a7a8d5435f4e9610" ON "registro_auditoria" ("accion") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9858e3462bc92a70cdef784807" ON "registro_auditoria" ("entidad_afectada", "id_entidad_afectada") `,
    );
    await queryRunner.query(
      `CREATE TABLE "parametro_sistema" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "nombre" character varying(80) NOT NULL, "valor" numeric(12,2) NOT NULL, "descripcion" text, CONSTRAINT "PK_5d93fad48e678ceb46d42773106" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_da2757ea50d5c42bdb446185b5" ON "parametro_sistema" ("nombre") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "notificacion" ("id" SERIAL NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "id_usuario" integer NOT NULL, "titulo" character varying(150) NOT NULL, "mensaje" text NOT NULL, CONSTRAINT "PK_b4402a54386266ca21a86420f77" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4fcdca2522991d21d8043089a4" ON "notificacion" ("id_usuario") `,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_favorito" ADD CONSTRAINT "FK_9e21a56330dfeb412da389a65e7" FOREIGN KEY ("id_lista_favorito") REFERENCES "lista_favorito"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_favorito" ADD CONSTRAINT "FK_9849f202beb0fa254246d77916f" FOREIGN KEY ("id_actividad") REFERENCES "actividad"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista_favorito" ADD CONSTRAINT "FK_5a832cc77082dff4c28faba69a6" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_favorito" ADD CONSTRAINT "FK_5bb523c3b2456434eeef983e5b9" FOREIGN KEY ("id_lista_favorito") REFERENCES "lista_favorito"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_favorito" ADD CONSTRAINT "FK_066d076a1233db03093782801e0" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ciudad" ADD CONSTRAINT "FK_3c8eee9bb03a8230c42c7065d0e" FOREIGN KEY ("id_pais") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_lugar" ADD CONSTRAINT "FK_15676e006b77a2dd45d41485d34" FOREIGN KEY ("id_actividad") REFERENCES "actividad"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_lugar" ADD CONSTRAINT "FK_f6182fa5efe3c0855c8f707f681" FOREIGN KEY ("id_lugar") REFERENCES "lugar"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lugar" ADD CONSTRAINT "FK_eeae9a2142d385ea02fd3c7a3ae" FOREIGN KEY ("id_departamento") REFERENCES "departamento"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "departamento" ADD CONSTRAINT "FK_232d8c44f73877aae73d92b30a9" FOREIGN KEY ("id_ciudad") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_categoria" ADD CONSTRAINT "FK_8040832780f57d18c6c4bfd6e47" FOREIGN KEY ("id_actividad") REFERENCES "actividad"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_categoria" ADD CONSTRAINT "FK_19e0e77fa5d50a1fe2d419602db" FOREIGN KEY ("id_categoria") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "preferencia_usuario" ADD CONSTRAINT "FK_6d2b257030cf85a905f78e85a7a" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "preferencia_usuario" ADD CONSTRAINT "FK_c7daba32696513232c01cc59e7c" FOREIGN KEY ("id_categoria") REFERENCES "categoria"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categoria" ADD CONSTRAINT "FK_5c37f6d38c6b5e1b81a741b9e6d" FOREIGN KEY ("id_estado_categoria") REFERENCES "estado_categoria"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan_categoria" ADD CONSTRAINT "FK_9e2be8a9b1c46e4e9f237b0d6e8" FOREIGN KEY ("id_solicitud_plan") REFERENCES "solicitud_plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan_categoria" ADD CONSTRAINT "FK_52e9d1ab1e8a0c4ece4406e3e67" FOREIGN KEY ("id_categoria") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" ADD CONSTRAINT "FK_401ec6171e761eec3847fe273f4" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" ADD CONSTRAINT "FK_40f26bd56bceb0276b669c48cd1" FOREIGN KEY ("id_departamento") REFERENCES "departamento"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" ADD CONSTRAINT "FK_7cbe8f2c699a6024f1797774d79" FOREIGN KEY ("id_tipo_salida") REFERENCES "tipo_salida"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" ADD CONSTRAINT "FK_f8f4fe8c9b57288f877c278936b" FOREIGN KEY ("id_estado_solicitud") REFERENCES "estado_solicitud"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_plan" ADD CONSTRAINT "FK_07245e38f74f8bf33e026be62a2" FOREIGN KEY ("id_plan") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_plan" ADD CONSTRAINT "FK_dd25123bdedc668a662f76fb403" FOREIGN KEY ("id_actividad") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "FK_9bfe6d6892ae920b93b6d956993" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "FK_6384e79e4065feae287e2187d80" FOREIGN KEY ("id_solicitud_plan") REFERENCES "solicitud_plan"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "FK_546795495ad705dcf902629152f" FOREIGN KEY ("id_estado_plan") REFERENCES "estado_plan"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rol_permiso" ADD CONSTRAINT "FK_1d9e5be3d74310f98e398912d94" FOREIGN KEY ("id_rol") REFERENCES "rol"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rol_permiso" ADD CONSTRAINT "FK_9c0fd212b970f71bf0a9465c4f3" FOREIGN KEY ("id_permiso") REFERENCES "permiso"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuario" ADD CONSTRAINT "FK_3628e9894c4b014d61a01cb21dd" FOREIGN KEY ("id_rol") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuario" ADD CONSTRAINT "FK_b76cd72443a8aafe1219a390d7b" FOREIGN KEY ("id_estado_usuario") REFERENCES "estado_usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coleccion" ADD CONSTRAINT "FK_d4d9153c07e6bcb5f44bd6b6a63" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coleccion_favorito" ADD CONSTRAINT "FK_7e20051c451f32db54c07fc8f5a" FOREIGN KEY ("id_coleccion") REFERENCES "coleccion"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "coleccion_favorito" ADD CONSTRAINT "FK_f4b383fc5bef129e17f10a59cd6" FOREIGN KEY ("id_actividad") REFERENCES "actividad"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "retroalimentacion" ADD CONSTRAINT "FK_74e745209a7dca782d686b979e9" FOREIGN KEY ("id_solicitud_plan") REFERENCES "solicitud_plan"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "retroalimentacion" ADD CONSTRAINT "FK_7d624469c911039cbaf71303190" FOREIGN KEY ("id_estado_retroalimentacion") REFERENCES "estado_retroalimentacion"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "valoracion" ADD CONSTRAINT "FK_b7026ff0010fc811de47515f06d" FOREIGN KEY ("id_actividad") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "valoracion" ADD CONSTRAINT "FK_64578a948cf3df0f4cc7a75cab8" FOREIGN KEY ("id_retroalimentacion") REFERENCES "retroalimentacion"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sincronizacion_externa" ADD CONSTRAINT "FK_156bef31aed1f91c014999c4137" FOREIGN KEY ("id_proveedor_externo") REFERENCES "proveedor_externo"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sesion_usuario" ADD CONSTRAINT "FK_b73ffa9c87c0e22796dc828e07a" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "recuperacion_contrasena" ADD CONSTRAINT "FK_c841789ba8eb2255d21016d20b9" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notificacion" ADD CONSTRAINT "FK_4fcdca2522991d21d8043089a48" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notificacion" DROP CONSTRAINT "FK_4fcdca2522991d21d8043089a48"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recuperacion_contrasena" DROP CONSTRAINT "FK_c841789ba8eb2255d21016d20b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sesion_usuario" DROP CONSTRAINT "FK_b73ffa9c87c0e22796dc828e07a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sincronizacion_externa" DROP CONSTRAINT "FK_156bef31aed1f91c014999c4137"`,
    );
    await queryRunner.query(
      `ALTER TABLE "valoracion" DROP CONSTRAINT "FK_64578a948cf3df0f4cc7a75cab8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "valoracion" DROP CONSTRAINT "FK_b7026ff0010fc811de47515f06d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "retroalimentacion" DROP CONSTRAINT "FK_7d624469c911039cbaf71303190"`,
    );
    await queryRunner.query(
      `ALTER TABLE "retroalimentacion" DROP CONSTRAINT "FK_74e745209a7dca782d686b979e9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coleccion_favorito" DROP CONSTRAINT "FK_f4b383fc5bef129e17f10a59cd6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coleccion_favorito" DROP CONSTRAINT "FK_7e20051c451f32db54c07fc8f5a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "coleccion" DROP CONSTRAINT "FK_d4d9153c07e6bcb5f44bd6b6a63"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuario" DROP CONSTRAINT "FK_b76cd72443a8aafe1219a390d7b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "usuario" DROP CONSTRAINT "FK_3628e9894c4b014d61a01cb21dd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rol_permiso" DROP CONSTRAINT "FK_9c0fd212b970f71bf0a9465c4f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "rol_permiso" DROP CONSTRAINT "FK_1d9e5be3d74310f98e398912d94"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP CONSTRAINT "FK_546795495ad705dcf902629152f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP CONSTRAINT "FK_6384e79e4065feae287e2187d80"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" DROP CONSTRAINT "FK_9bfe6d6892ae920b93b6d956993"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_plan" DROP CONSTRAINT "FK_dd25123bdedc668a662f76fb403"`,
    );
    await queryRunner.query(
      `ALTER TABLE "detalle_plan" DROP CONSTRAINT "FK_07245e38f74f8bf33e026be62a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" DROP CONSTRAINT "FK_f8f4fe8c9b57288f877c278936b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" DROP CONSTRAINT "FK_7cbe8f2c699a6024f1797774d79"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" DROP CONSTRAINT "FK_40f26bd56bceb0276b669c48cd1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" DROP CONSTRAINT "FK_401ec6171e761eec3847fe273f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan_categoria" DROP CONSTRAINT "FK_52e9d1ab1e8a0c4ece4406e3e67"`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan_categoria" DROP CONSTRAINT "FK_9e2be8a9b1c46e4e9f237b0d6e8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categoria" DROP CONSTRAINT "FK_5c37f6d38c6b5e1b81a741b9e6d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "preferencia_usuario" DROP CONSTRAINT "FK_c7daba32696513232c01cc59e7c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "preferencia_usuario" DROP CONSTRAINT "FK_6d2b257030cf85a905f78e85a7a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_categoria" DROP CONSTRAINT "FK_19e0e77fa5d50a1fe2d419602db"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_categoria" DROP CONSTRAINT "FK_8040832780f57d18c6c4bfd6e47"`,
    );
    await queryRunner.query(
      `ALTER TABLE "departamento" DROP CONSTRAINT "FK_232d8c44f73877aae73d92b30a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lugar" DROP CONSTRAINT "FK_eeae9a2142d385ea02fd3c7a3ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_lugar" DROP CONSTRAINT "FK_f6182fa5efe3c0855c8f707f681"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_lugar" DROP CONSTRAINT "FK_15676e006b77a2dd45d41485d34"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ciudad" DROP CONSTRAINT "FK_3c8eee9bb03a8230c42c7065d0e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_favorito" DROP CONSTRAINT "FK_066d076a1233db03093782801e0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan_favorito" DROP CONSTRAINT "FK_5bb523c3b2456434eeef983e5b9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lista_favorito" DROP CONSTRAINT "FK_5a832cc77082dff4c28faba69a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_favorito" DROP CONSTRAINT "FK_9849f202beb0fa254246d77916f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "actividad_favorito" DROP CONSTRAINT "FK_9e21a56330dfeb412da389a65e7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4fcdca2522991d21d8043089a4"`,
    );
    await queryRunner.query(`DROP TABLE "notificacion"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_da2757ea50d5c42bdb446185b5"`,
    );
    await queryRunner.query(`DROP TABLE "parametro_sistema"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9858e3462bc92a70cdef784807"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9a2d057150a7a8d5435f4e9610"`,
    );
    await queryRunner.query(`DROP TABLE "registro_auditoria"`);
    await queryRunner.query(
      `DROP TYPE "public"."registro_auditoria_accion_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3d6ba5f53f98a8f8464178e8c6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c841789ba8eb2255d21016d20b"`,
    );
    await queryRunner.query(`DROP TABLE "recuperacion_contrasena"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3a1178d9d1997bb54807eb0fef"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e37a5ef3162c2d4192d79ac465"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b73ffa9c87c0e22796dc828e07"`,
    );
    await queryRunner.query(`DROP TABLE "sesion_usuario"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a6e9b19986f8ea90f34728eb12"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_156bef31aed1f91c014999c413"`,
    );
    await queryRunner.query(`DROP TABLE "sincronizacion_externa"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5e38f7470100498d2f32ce8c25"`,
    );
    await queryRunner.query(`DROP TABLE "proveedor_externo"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_64578a948cf3df0f4cc7a75cab"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b7026ff0010fc811de47515f06"`,
    );
    await queryRunner.query(`DROP TABLE "valoracion"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7d624469c911039cbaf7130319"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_74e745209a7dca782d686b979e"`,
    );
    await queryRunner.query(`DROP TABLE "retroalimentacion"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_29ed8f24549ed233d89651fa06"`,
    );
    await queryRunner.query(`DROP TABLE "estado_retroalimentacion"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1245dbcfdd036eb3258452cba4"`,
    );
    await queryRunner.query(`DROP TABLE "actividad"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0299d0efa647d33cd013ffa364"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f4b383fc5bef129e17f10a59cd"`,
    );
    await queryRunner.query(`DROP TABLE "coleccion_favorito"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_335d4183f28956056a04fa1339"`,
    );
    await queryRunner.query(`DROP TABLE "coleccion"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b76cd72443a8aafe1219a390d7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3628e9894c4b014d61a01cb21d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_497f2bf34567f8d20bfc917a9a"`,
    );
    await queryRunner.query(`DROP TABLE "usuario"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a34daca1ffe7e1818525cd68c4"`,
    );
    await queryRunner.query(`DROP TABLE "rol"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9fe4e366696bfc371bb7c5d776"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9c0fd212b970f71bf0a9465c4f"`,
    );
    await queryRunner.query(`DROP TABLE "rol_permiso"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5f3b591d112e53d40884760dbc"`,
    );
    await queryRunner.query(`DROP TABLE "permiso"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_212c68435545eb3c5863b9993e"`,
    );
    await queryRunner.query(`DROP TABLE "estado_usuario"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_546795495ad705dcf902629152"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6384e79e4065feae287e2187d8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9bfe6d6892ae920b93b6d95699"`,
    );
    await queryRunner.query(`DROP TABLE "plan"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dcd515d5422e9b41a414e0cfe5"`,
    );
    await queryRunner.query(`DROP TABLE "estado_plan"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d0588c85aa20b6861de0f62c14"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dd25123bdedc668a662f76fb40"`,
    );
    await queryRunner.query(`DROP TABLE "detalle_plan"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f8f4fe8c9b57288f877c278936"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7cbe8f2c699a6024f1797774d7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2cd76349be2f7de4f17c574f9f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_40f26bd56bceb0276b669c48cd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_401ec6171e761eec3847fe273f"`,
    );
    await queryRunner.query(`DROP TABLE "solicitud_plan"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a5ddcad58aa0ab84bfe2dbbcd7"`,
    );
    await queryRunner.query(`DROP TABLE "tipo_salida"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_071a57810a0b7db794e4600e4c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_52e9d1ab1e8a0c4ece4406e3e6"`,
    );
    await queryRunner.query(`DROP TABLE "solicitud_plan_categoria"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_5c37f6d38c6b5e1b81a741b9e6"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_df5055376f092511f55cc1f0bc"`,
    );
    await queryRunner.query(`DROP TABLE "categoria"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_47630d3deddd9c2be78a568fc6"`,
    );
    await queryRunner.query(`DROP TABLE "estado_categoria"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_93c3807a3bac0c831c317eb392"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c7daba32696513232c01cc59e7"`,
    );
    await queryRunner.query(`DROP TABLE "preferencia_usuario"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a78a0bd3bc2ff158e5fcc38c7d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_19e0e77fa5d50a1fe2d419602d"`,
    );
    await queryRunner.query(`DROP TABLE "actividad_categoria"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9eda27a2d475f41b50ae392a1a"`,
    );
    await queryRunner.query(`DROP TABLE "estado_solicitud"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_28fb66df9848646a5cdd4219fd"`,
    );
    await queryRunner.query(`DROP TABLE "departamento"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_eeae9a2142d385ea02fd3c7a3a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4f91b1efc5cf17b1146093b85e"`,
    );
    await queryRunner.query(`DROP TABLE "lugar"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ccf26f263f785181f440ab9391"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4fd14e6b18a073b79d17c3e9ce"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f6182fa5efe3c0855c8f707f68"`,
    );
    await queryRunner.query(`DROP TABLE "actividad_lugar"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c7fe4a6720cc07a2978e9a443f"`,
    );
    await queryRunner.query(`DROP TABLE "ciudad"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_803c3018fcec4428e4cdc89d05"`,
    );
    await queryRunner.query(`DROP TABLE "pais"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8405127591675c1c4f9ba6514a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_066d076a1233db03093782801e"`,
    );
    await queryRunner.query(`DROP TABLE "plan_favorito"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_1e451fbe685de976eac68a6d3b"`,
    );
    await queryRunner.query(`DROP TABLE "lista_favorito"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7cf25f0be7dfdf429756d45da5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9849f202beb0fa254246d77916"`,
    );
    await queryRunner.query(`DROP TABLE "actividad_favorito"`);
  }
}
