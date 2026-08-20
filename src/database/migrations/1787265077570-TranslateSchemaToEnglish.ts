import { MigrationInterface, QueryRunner } from 'typeorm';

type RenamePair = readonly [from: string, to: string];
type ColumnRename = readonly [table: string, from: string, to: string];
type DataRename = readonly [table: string, from: string, to: string];

const TABLE_RENAMES: readonly RenamePair[] = [
  ['actividad_favorito', 'favorite_activity'],
  ['lista_favorito', 'favorite_list'],
  ['plan_favorito', 'favorite_plan'],
  ['pais', 'country'],
  ['ciudad', 'city'],
  ['actividad_lugar', 'activity_place'],
  ['lugar', 'place'],
  ['departamento', 'department'],
  ['estado_solicitud', 'request_status'],
  ['actividad_categoria', 'activity_category'],
  ['preferencia_usuario', 'user_preference'],
  ['estado_categoria', 'category_status'],
  ['categoria', 'category'],
  ['solicitud_plan_categoria', 'plan_request_category'],
  ['tipo_salida', 'outing_type'],
  ['solicitud_plan', 'plan_request'],
  ['detalle_plan', 'plan_detail'],
  ['estado_plan', 'plan_status'],
  ['estado_usuario', 'user_status'],
  ['permiso', 'permission'],
  ['rol_permiso', 'role_permission'],
  ['rol', 'role'],
  ['usuario', 'user'],
  ['coleccion', 'collection'],
  ['coleccion_favorito', 'favorite_collection'],
  ['actividad', 'activity'],
  ['estado_retroalimentacion', 'feedback_status'],
  ['retroalimentacion', 'feedback'],
  ['valoracion', 'rating'],
  ['proveedor_externo', 'external_provider'],
  ['sincronizacion_externa', 'external_sync'],
  ['sesion_usuario', 'user_session'],
  ['recuperacion_contrasena', 'password_recovery'],
  ['registro_auditoria', 'audit_log'],
  ['parametro_sistema', 'system_parameter'],
  ['notificacion', 'notification'],
];

const COLUMN_RENAMES: readonly ColumnRename[] = [
  ['favorite_activity', 'id_lista_favorito', 'id_favorite_list'],
  ['favorite_activity', 'id_actividad', 'id_activity'],
  ['favorite_list', 'id_usuario', 'id_user'],
  ['favorite_plan', 'id_lista_favorito', 'id_favorite_list'],
  ['country', 'nombre', 'name'],
  ['country', 'descripcion', 'description'],
  ['city', 'id_pais', 'id_country'],
  ['city', 'nombre', 'name'],
  ['city', 'descripcion', 'description'],
  ['activity_place', 'id_actividad', 'id_activity'],
  ['activity_place', 'id_lugar', 'id_place'],
  ['activity_place', 'latitud', 'latitude'],
  ['activity_place', 'longitud', 'longitude'],
  ['activity_place', 'observaciones', 'notes'],
  ['place', 'nombre', 'name'],
  ['place', 'descripcion', 'description'],
  ['place', 'direccion', 'address'],
  ['place', 'id_departamento', 'id_department'],
  ['department', 'id_ciudad', 'id_city'],
  ['department', 'nombre', 'name'],
  ['department', 'descripcion', 'description'],
  ['request_status', 'nombre', 'name'],
  ['request_status', 'descripcion', 'description'],
  ['activity_category', 'id_actividad', 'id_activity'],
  ['activity_category', 'id_categoria', 'id_category'],
  ['user_preference', 'id_usuario', 'id_user'],
  ['user_preference', 'id_categoria', 'id_category'],
  ['category_status', 'nombre', 'name'],
  ['category_status', 'descripcion', 'description'],
  ['category', 'nombre', 'name'],
  ['category', 'descripcion', 'description'],
  ['category', 'id_estado_categoria', 'id_category_status'],
  ['plan_request_category', 'id_solicitud_plan', 'id_plan_request'],
  ['plan_request_category', 'id_categoria', 'id_category'],
  ['plan_request_category', 'descripcion', 'description'],
  ['outing_type', 'nombre', 'name'],
  ['outing_type', 'descripcion', 'description'],
  ['plan_request', 'id_usuario', 'id_user'],
  ['plan_request', 'presupuesto', 'budget'],
  ['plan_request', 'id_departamento', 'id_department'],
  ['plan_request', 'duracion_disponible', 'available_duration'],
  ['plan_request', 'fecha_solicitud', 'requested_at'],
  ['plan_request', 'id_tipo_salida', 'id_outing_type'],
  ['plan_request', 'id_estado_solicitud', 'id_request_status'],
  ['plan_request', 'observaciones', 'notes'],
  ['plan_detail', 'id_actividad', 'id_activity'],
  ['plan_detail', 'orden', 'order'],
  ['plan_detail', 'costo_estimado', 'estimated_cost'],
  ['plan_detail', 'duracion_estimada', 'estimated_duration'],
  ['plan_detail', 'observacion', 'note'],
  ['plan_status', 'nombre', 'name'],
  ['plan_status', 'descripcion', 'description'],
  ['plan', 'titulo', 'title'],
  ['plan', 'descripcion', 'description'],
  ['plan', 'id_usuario', 'id_user'],
  ['plan', 'id_solicitud_plan', 'id_plan_request'],
  ['plan', 'id_estado_plan', 'id_plan_status'],
  ['plan', 'costo_total_estimado', 'estimated_total_cost'],
  ['plan', 'duracion_total_estimada', 'estimated_total_duration'],
  ['user_status', 'nombre', 'name'],
  ['user_status', 'descripcion', 'description'],
  ['permission', 'nombre', 'name'],
  ['permission', 'descripcion', 'description'],
  ['role_permission', 'id_rol', 'id_role'],
  ['role_permission', 'id_permiso', 'id_permission'],
  ['role', 'nombre', 'name'],
  ['role', 'descripcion', 'description'],
  ['user', 'nombre', 'name'],
  ['user', 'apellido', 'last_name'],
  ['user', 'id_rol', 'id_role'],
  ['user', 'id_estado_usuario', 'id_user_status'],
  ['collection', 'id_usuario', 'id_user'],
  ['collection', 'nombre_coleccion', 'name'],
  ['collection', 'fecha_guardado', 'saved_at'],
  ['favorite_collection', 'id_coleccion', 'id_collection'],
  ['favorite_collection', 'id_actividad', 'id_activity'],
  ['favorite_collection', 'orden', 'order'],
  ['activity', 'nombre', 'name'],
  ['activity', 'descripcion', 'description'],
  ['activity', 'costo_estimado', 'estimated_cost'],
  ['activity', 'duracion_estimada', 'estimated_duration'],
  ['feedback_status', 'nombre', 'name'],
  ['feedback_status', 'descripcion', 'description'],
  ['feedback', 'titulo', 'title'],
  ['feedback', 'descripcion', 'description'],
  ['feedback', 'costo_real', 'actual_cost'],
  ['feedback', 'duracion_real', 'actual_duration'],
  ['feedback', 'id_solicitud_plan', 'id_plan_request'],
  ['feedback', 'id_estado_retroalimentacion', 'id_feedback_status'],
  ['rating', 'id_actividad', 'id_activity'],
  ['rating', 'id_retroalimentacion', 'id_feedback'],
  ['external_provider', 'nombre', 'name'],
  ['external_provider', 'descripcion', 'description'],
  ['external_provider', 'activo', 'active'],
  ['external_sync', 'id_proveedor_externo', 'id_external_provider'],
  ['external_sync', 'entidad', 'entity'],
  ['external_sync', 'estado', 'status'],
  ['external_sync', 'fecha_inicio', 'started_at'],
  ['external_sync', 'fecha_fin', 'ended_at'],
  ['external_sync', 'cantidad_registros', 'record_count'],
  ['external_sync', 'mensaje_error', 'error_message'],
  ['user_session', 'id_usuario', 'id_user'],
  ['user_session', 'fecha_inicio', 'started_at'],
  ['user_session', 'activa', 'active'],
  ['password_recovery', 'id_usuario', 'id_user'],
  ['password_recovery', 'fecha_creacion', 'token_created_at'],
  ['password_recovery', 'fecha_expiracion', 'expires_at'],
  ['password_recovery', 'usado', 'used'],
  ['audit_log', 'accion', 'action'],
  ['audit_log', 'entidad_afectada', 'affected_entity'],
  ['audit_log', 'id_entidad_afectada', 'id_affected_entity'],
  ['audit_log', 'cambios', 'changes'],
  ['system_parameter', 'nombre', 'name'],
  ['system_parameter', 'valor', 'value'],
  ['system_parameter', 'descripcion', 'description'],
  ['notification', 'id_usuario', 'id_user'],
  ['notification', 'titulo', 'title'],
  ['notification', 'mensaje', 'message'],
];

const ENUM_TYPE_RENAME: RenamePair = [
  'registro_auditoria_accion_enum',
  'audit_log_action_enum',
];

const ENUM_VALUE_RENAMES: readonly RenamePair[] = [
  ['crear', 'create'],
  ['actualizar', 'update'],
  ['eliminar', 'delete'],
  ['iniciar_sesion', 'start_session'],
  ['cerrar_sesion', 'end_session'],
];

const DATA_RENAMES: readonly DataRename[] = [
  ['role', 'usuario', 'user'],
  ['role', 'administrador', 'admin'],
  ['permission', 'perfil.consultar', 'profile.view'],
  ['permission', 'perfil.editar', 'profile.update'],
  ['permission', 'perfil.cambiar-contrasena', 'profile.change-password'],
  ['permission', 'perfil.eliminar', 'profile.delete'],
  ['permission', 'preferencia.editar', 'preference.update'],
  ['permission', 'actividad.listar', 'activity.list'],
  ['permission', 'actividad.consultar', 'activity.view'],
  ['permission', 'actividad.crear', 'activity.create'],
  ['permission', 'actividad.editar', 'activity.update'],
  ['permission', 'actividad.eliminar', 'activity.delete'],
  ['permission', 'categoria.listar', 'category.list'],
  ['permission', 'categoria.crear', 'category.create'],
  ['permission', 'categoria.editar', 'category.update'],
  ['permission', 'categoria.eliminar', 'category.delete'],
  ['permission', 'plan.listar', 'plan.list'],
  ['permission', 'plan.consultar', 'plan.view'],
  ['permission', 'plan.generar', 'plan.generate'],
  ['permission', 'plan.seleccionar', 'plan.select'],
  ['permission', 'plan.crear', 'plan.create'],
  ['permission', 'plan.editar', 'plan.update'],
  ['permission', 'plan.eliminar', 'plan.delete'],
  ['permission', 'plan.gestionar', 'plan.manage'],
  ['permission', 'retroalimentacion.registrar', 'feedback.create'],
  ['permission', 'retroalimentacion.revisar', 'feedback.review'],
  ['permission', 'coleccion.listar', 'collection.list'],
  ['permission', 'coleccion.consultar', 'collection.view'],
  ['permission', 'coleccion.crear', 'collection.create'],
  ['permission', 'coleccion.editar', 'collection.update'],
  ['permission', 'coleccion.eliminar', 'collection.delete'],
  ['permission', 'favorito.listar', 'favorite.list'],
  ['permission', 'favorito.guardar', 'favorite.save'],
  ['permission', 'favorito.quitar', 'favorite.remove'],
  ['permission', 'valoracion.listar', 'rating.list'],
  ['permission', 'valoracion.crear', 'rating.create'],
  ['permission', 'valoracion.editar', 'rating.update'],
  ['permission', 'valoracion.eliminar', 'rating.delete'],
  ['permission', 'valoracion.moderar', 'rating.moderate'],
  ['permission', 'usuario.listar', 'user.list'],
  ['permission', 'usuario.consultar', 'user.view'],
  ['permission', 'usuario.editar', 'user.update'],
  ['permission', 'usuario.cambiar-estado', 'user.change-status'],
  ['permission', 'usuario.eliminar', 'user.delete'],
  ['permission', 'contenido.eliminar', 'content.delete'],
  ['permission', 'metrica.consultar', 'metric.view'],
  ['permission', 'rol.listar', 'role.list'],
  ['permission', 'rol.crear', 'role.create'],
  ['permission', 'rol.editar', 'role.update'],
  ['permission', 'rol.eliminar', 'role.delete'],
  ['permission', 'permiso.listar', 'permission.list'],
  ['permission', 'permiso.asignar', 'permission.assign'],
  ['user_status', 'activo', 'active'],
  ['user_status', 'suspendido', 'suspended'],
  ['user_status', 'baneado', 'banned'],
  ['plan_status', 'generado', 'generated'],
  ['plan_status', 'seleccionado', 'selected'],
  ['plan_status', 'confirmado', 'confirmed'],
  ['plan_status', 'finalizado', 'completed'],
  ['plan_status', 'cancelado', 'cancelled'],
  ['category_status', 'activa', 'active'],
  ['category_status', 'inactiva', 'inactive'],
  ['feedback_status', 'pendiente', 'pending'],
  ['feedback_status', 'procesada', 'processed'],
  ['feedback_status', 'descartada', 'discarded'],
];

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function assertTableIsEmpty(
  queryRunner: QueryRunner,
  table: string,
): Promise<void> {
  const result = (await queryRunner.query(
    `SELECT EXISTS (SELECT 1 FROM ${quoteIdentifier(table)}) AS "hasRows"`,
  )) as Array<{ hasRows: boolean }>;

  if (result[0]?.hasRows) {
    throw new Error(
      `Cannot reconcile the legacy ${table} table automatically because it contains rows`,
    );
  }
}

async function reconcileLegacySchema(queryRunner: QueryRunner): Promise<void> {
  const planRequestNeedsDepartment = !(await queryRunner.hasColumn(
    'solicitud_plan',
    'id_departamento',
  ));
  const planRequestNeedsDuration = !(await queryRunner.hasColumn(
    'solicitud_plan',
    'duracion_disponible',
  ));

  if (planRequestNeedsDepartment || planRequestNeedsDuration) {
    await assertTableIsEmpty(queryRunner, 'solicitud_plan');
  }

  if (planRequestNeedsDepartment) {
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" ADD COLUMN "id_departamento" integer NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40f26bd56bceb0276b669c48cd" ON "solicitud_plan" ("id_departamento")`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" ADD CONSTRAINT "FK_40f26bd56bceb0276b669c48cd1" FOREIGN KEY ("id_departamento") REFERENCES "departamento"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  if (planRequestNeedsDuration) {
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" ADD COLUMN "duracion_disponible" integer NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "solicitud_plan" ADD CONSTRAINT "CHK_5dc988ce27e6f02da73c4e0c26" CHECK ("duracion_disponible" > 0)`,
    );
  }

  if (!(await queryRunner.hasColumn('plan', 'id_usuario'))) {
    await assertTableIsEmpty(queryRunner, 'plan');
    await queryRunner.query(
      `ALTER TABLE "plan" ADD COLUMN "id_usuario" integer NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9bfe6d6892ae920b93b6d95699" ON "plan" ("id_usuario")`,
    );
    await queryRunner.query(
      `ALTER TABLE "plan" ADD CONSTRAINT "FK_9bfe6d6892ae920b93b6d956993" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  if (!(await queryRunner.hasColumn('valoracion', 'id_actividad'))) {
    await assertTableIsEmpty(queryRunner, 'valoracion');

    if (await queryRunner.hasColumn('valoracion', 'id_plan')) {
      await queryRunner.query(
        `ALTER TABLE "valoracion" DROP COLUMN "id_plan" CASCADE`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE "valoracion" ADD COLUMN "id_actividad" integer NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b7026ff0010fc811de47515f06" ON "valoracion" ("id_actividad")`,
    );
    await queryRunner.query(
      `ALTER TABLE "valoracion" ADD CONSTRAINT "FK_b7026ff0010fc811de47515f06d" FOREIGN KEY ("id_actividad") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }
}

/**
 * Preserves existing rows while translating the physical PostgreSQL schema.
 *
 * The previous migration name is intentionally kept in the historical migration
 * because TypeORM stores that class name in its migrations table.
 */
export class TranslateSchemaToEnglish1787265077570 implements MigrationInterface {
  name = 'TranslateSchemaToEnglish1787265077570';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await reconcileLegacySchema(queryRunner);

    for (const [from, to] of TABLE_RENAMES) {
      await queryRunner.query(
        `ALTER TABLE ${quoteIdentifier(from)} RENAME TO ${quoteIdentifier(to)}`,
      );
    }

    for (const [from, to] of TABLE_RENAMES) {
      await queryRunner.query(
        `ALTER SEQUENCE IF EXISTS ${quoteIdentifier(`${from}_id_seq`)} RENAME TO ${quoteIdentifier(`${to}_id_seq`)}`,
      );
    }

    for (const [table, from, to] of COLUMN_RENAMES) {
      await queryRunner.query(
        `ALTER TABLE ${quoteIdentifier(table)} RENAME COLUMN ${quoteIdentifier(from)} TO ${quoteIdentifier(to)}`,
      );
    }

    const [oldType, newType] = ENUM_TYPE_RENAME;
    for (const [from, to] of ENUM_VALUE_RENAMES) {
      await queryRunner.query(
        `ALTER TYPE ${quoteIdentifier(oldType)} RENAME VALUE '${from}' TO '${to}'`,
      );
    }
    await queryRunner.query(
      `ALTER TYPE ${quoteIdentifier(oldType)} RENAME TO ${quoteIdentifier(newType)}`,
    );

    for (const [table, from, to] of DATA_RENAMES) {
      await queryRunner.query(
        `UPDATE ${quoteIdentifier(table)} SET "key" = $1 WHERE "key" = $2`,
        [to, from],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, from, to] of [...DATA_RENAMES].reverse()) {
      await queryRunner.query(
        `UPDATE ${quoteIdentifier(table)} SET "key" = $1 WHERE "key" = $2`,
        [from, to],
      );
    }

    const [oldType, newType] = ENUM_TYPE_RENAME;
    await queryRunner.query(
      `ALTER TYPE ${quoteIdentifier(newType)} RENAME TO ${quoteIdentifier(oldType)}`,
    );
    for (const [from, to] of [...ENUM_VALUE_RENAMES].reverse()) {
      await queryRunner.query(
        `ALTER TYPE ${quoteIdentifier(oldType)} RENAME VALUE '${to}' TO '${from}'`,
      );
    }

    for (const [table, from, to] of [...COLUMN_RENAMES].reverse()) {
      await queryRunner.query(
        `ALTER TABLE ${quoteIdentifier(table)} RENAME COLUMN ${quoteIdentifier(to)} TO ${quoteIdentifier(from)}`,
      );
    }

    for (const [from, to] of [...TABLE_RENAMES].reverse()) {
      await queryRunner.query(
        `ALTER SEQUENCE IF EXISTS ${quoteIdentifier(`${to}_id_seq`)} RENAME TO ${quoteIdentifier(`${from}_id_seq`)}`,
      );
    }

    for (const [from, to] of [...TABLE_RENAMES].reverse()) {
      await queryRunner.query(
        `ALTER TABLE ${quoteIdentifier(to)} RENAME TO ${quoteIdentifier(from)}`,
      );
    }
  }
}
