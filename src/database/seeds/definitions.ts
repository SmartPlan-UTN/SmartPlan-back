/**
 * Definición de los data semilla del sistema (F09).
 *
 * Acá está **qué** se siembra; en `sembrar.ts` está **cómo**. Separarlos permite
 * revisar los valores del dominio —que salen de los casos de uso y del diagrama
 * de classes— sin leer la mecánica de idempotencia, y testear las definiciones
 * sin necesidad de base de data (`definiciones.spec.ts`).
 *
 * Nada de esto es opcional: sin roles, permissions ni statuses, un signup de
 * user (CU2) no tiene a qué apuntar sus claves foráneas y la autenticación no
 * puede arrancar.
 */

/**
 * Límites de las columns de `CatalogEntity`. Están replicados acá para que
 * `definiciones.spec.ts` pueda verificar que ningún value se pase de largo sin
 * levantar la base: un `varchar(40)` desbordado recién falla al insertar.
 */
export const MAX_LENGTH = {
  key: 40,
  name: 80,
  description: 200,
} as const;

/** Clave del role de la persona que usa la aplicación. */
export const USER_ROLE = 'user';

/** Clave del role que administra el sistema. */
export const ADMIN_ROLE = 'admin';

export type RoleKey = typeof USER_ROLE | typeof ADMIN_ROLE;

/** Forma común de todo value de catálogo (`role`, `permission`, `status_*`). */
export interface CatalogValue {
  key: string;
  name: string;
  description: string;
}

/**
 * Un permission más los roles que lo reciben de arranque.
 *
 * La asignación viaja **dentro** del permission y no en una list aparte a
 * propósito: una list suelta de claves se desincroniza en cuanto alguien
 * renombra un permission, y el error recién aparece al correr la semilla.
 */
export interface PermissionDefinition extends CatalogValue {
  roles: readonly RoleKey[];
}

const AMBOS: readonly RoleKey[] = [USER_ROLE, ADMIN_ROLE];
const SOLO_ADMINISTRADOR: readonly RoleKey[] = [ADMIN_ROLE];

/**
 * Roles del sistema (CU62). Son los dos que reconoce la documentación: el resto
 * de los profilees se arma otorgando permissions, no creando roles nuevos.
 */
export const ROLES: readonly CatalogValue[] = [
  {
    key: USER_ROLE,
    name: 'User',
    description:
      'Persona registrada que genera, guarda y valora sus propios plans.',
  },
  {
    key: ADMIN_ROLE,
    name: 'Administrador',
    description: 'Gestiona el catálogo, los users y la moderación del sistema.',
  },
];

/**
 * Permissions del sistema (CU61). La `key` tiene el formato `resource.action` que
 * espera el guard de autorización (ver `permission.entity.ts`).
 *
 * El admin recibe **también** los permissions de user: administra el
 * sistema, pero además lo usa —genera plans, guarda favorites, valora—, y un
 * profile que no puede hacer nada de eso obligaría a mantener dos cuentas por
 * persona.
 */
export const PERMISSIONS: readonly PermissionDefinition[] = [
  // Perfil y cuenta propia — CU5, CU6, CU7, CU8, CU18
  {
    key: 'profile.view',
    name: 'Consultar el profile propio',
    description: 'Ver los data de la cuenta propia.',
    roles: AMBOS,
  },
  {
    key: 'profile.update',
    name: 'Editar el profile propio',
    description: 'Modificar los data de la cuenta propia (CU5).',
    roles: AMBOS,
  },
  {
    key: 'profile.change-password',
    name: 'Cambiar la contraseña propia',
    description: 'Reemplazar la contraseña de la cuenta propia (CU6).',
    roles: AMBOS,
  },
  {
    key: 'profile.delete',
    name: 'Delete la cuenta propia',
    description: 'Dar de baja la cuenta propia (CU7).',
    roles: AMBOS,
  },
  {
    key: 'preference.update',
    name: 'Editar las preferences propias',
    description:
      'Elegir las categorías y los parámetros que alimentan la recomendación (CU8, CU18).',
    roles: AMBOS,
  },

  // Catálogo de activities — CU9, CU10, CU11, CU14, CU16, CU53
  {
    key: 'activity.list',
    name: 'Listar activities',
    description:
      'Buscar, filtrar y orderar el catálogo de activities (CU9, CU10, CU11, CU16).',
    roles: AMBOS,
  },
  {
    key: 'activity.view',
    name: 'Consultar una activity',
    description: 'Ver el detail de una activity del catálogo (CU14).',
    roles: AMBOS,
  },
  {
    key: 'activity.create',
    name: 'Create activities',
    description: 'Dar de alta una activity en el catálogo (CU53).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'activity.update',
    name: 'Editar activities',
    description: 'Modificar una activity del catálogo (CU53).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'activity.delete',
    name: 'Delete activities',
    description: 'Dar de baja una activity del catálogo (CU53).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Categorías — CU10, CU54
  {
    key: 'category.list',
    name: 'Listar categorías',
    description:
      'Ver las categorías disponibles para filtrar y elegir preferences (CU10).',
    roles: AMBOS,
  },
  {
    key: 'category.create',
    name: 'Create categorías',
    description: 'Dar de alta una categoría del catálogo (CU54).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'category.update',
    name: 'Editar categorías',
    description: 'Modificar o desactivar una categoría del catálogo (CU54).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'category.delete',
    name: 'Delete categorías',
    description: 'Dar de baja una categoría del catálogo (CU54).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Planes — CU12, CU13, CU17, CU19, CU22, CU24 a CU31, CU60
  {
    key: 'plan.list',
    name: 'Listar plans',
    description: 'Buscar plans propios y recomendados (CU12, CU20).',
    roles: AMBOS,
  },
  {
    key: 'plan.view',
    name: 'Consultar un plan',
    description:
      'Ver el detail de un plan con sus activities y su costo (CU13, CU29, CU30).',
    roles: AMBOS,
  },
  {
    key: 'plan.generate',
    name: 'Generar plans automáticos',
    description:
      'Pedirle al motor de recomendación un plan a partir de una request (CU17, CU19, CU31).',
    roles: AMBOS,
  },
  {
    key: 'plan.select',
    name: 'Seleccionar un plan',
    description: 'Elegir uno de los plans que devolvió una request (CU22).',
    roles: AMBOS,
  },
  {
    key: 'plan.create',
    name: 'Create plans propios',
    description: 'Armar un plan a mano, sin pasar por el motor (CU24).',
    roles: AMBOS,
  },
  {
    key: 'plan.update',
    name: 'Editar plans propios',
    description:
      'Modificar un plan propio y agregarle o quitarle activities (CU25, CU27, CU28).',
    roles: AMBOS,
  },
  {
    key: 'plan.delete',
    name: 'Delete plans propios',
    description: 'Dar de baja un plan propio (CU26).',
    roles: AMBOS,
  },
  {
    key: 'plan.manage',
    name: 'Gestionar plans de cualquier user',
    description:
      'Editar o dar de baja plans que no son propios, desde la administración (CU60).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Retroalimentación — CU21, CU23, CU59
  {
    key: 'feedback.create',
    name: 'Registrar retroalimentación',
    description:
      'Dejar la devolución posterior a una experiencia, que alimenta la recomendación (CU23).',
    roles: AMBOS,
  },
  {
    key: 'feedback.review',
    name: 'Revisar retroalimentación',
    description:
      'Revisar las sugerencias de los users y decidir si se incorporan (CU59).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Collections — CU32 a CU38
  {
    key: 'collection.list',
    name: 'Listar collections propias',
    description: 'Ver las collections armadas por uno mismo (CU38).',
    roles: AMBOS,
  },
  {
    key: 'collection.view',
    name: 'Consultar una colección',
    description:
      'Ver el detail de una colección propia y sus activities (CU37).',
    roles: AMBOS,
  },
  {
    key: 'collection.create',
    name: 'Create collections',
    description: 'Armar una colección de activities (CU32).',
    roles: AMBOS,
  },
  {
    key: 'collection.update',
    name: 'Editar collections propias',
    description:
      'Renombrar una colección propia y agregarle o quitarle activities (CU33, CU35, CU36).',
    roles: AMBOS,
  },
  {
    key: 'collection.delete',
    name: 'Delete collections propias',
    description: 'Dar de baja una colección propia (CU34).',
    roles: AMBOS,
  },

  // Favorites — CU15, CU39 a CU43
  {
    key: 'favorite.list',
    name: 'Listar favorites propios',
    description: 'Ver las activities y los plans guardados (CU39, CU40).',
    roles: AMBOS,
  },
  {
    key: 'favorite.save',
    name: 'Guardar en favorites',
    description:
      'Guardar una activity o un plan en la list de favorites (CU15, CU43).',
    roles: AMBOS,
  },
  {
    key: 'favorite.remove',
    name: 'Quitar de favorites',
    description:
      'Sacar una activity o un plan de la list de favorites (CU41, CU42).',
    roles: AMBOS,
  },

  // Ratings — CU44 a CU47, CU55
  {
    key: 'rating.list',
    name: 'Listar ratings',
    description: 'Ver las ratings publicadas (CU45).',
    roles: AMBOS,
  },
  {
    key: 'rating.create',
    name: 'Create ratings',
    description: 'Puntuar y comentar una experiencia realizada (CU44).',
    roles: AMBOS,
  },
  {
    key: 'rating.update',
    name: 'Editar ratings propias',
    description: 'Modificar una valoración propia (CU46).',
    roles: AMBOS,
  },
  {
    key: 'rating.delete',
    name: 'Delete ratings propias',
    description: 'Dar de baja una valoración propia (CU47).',
    roles: AMBOS,
  },
  {
    key: 'rating.moderate',
    name: 'Moderar ratings',
    description: 'Aprobar o rechazar ratings de cualquier user (CU55).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Administración — CU56, CU57, CU58, CU61, CU62
  {
    key: 'user.list',
    name: 'Listar users',
    description: 'Ver el listado de users del sistema (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'user.view',
    name: 'Consultar un user',
    description: 'Ver la ficha de un user del sistema (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'user.update',
    name: 'Editar users',
    description: 'Modificar los data y el role de un user (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'user.change-status',
    name: 'Cambiar el status de un user',
    description: 'Suspender, banear o reactivar una cuenta (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'user.delete',
    name: 'Delete users',
    description: 'Dar de baja la cuenta de un user (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'content.delete',
    name: 'Delete contenido',
    description:
      'Dar de baja contenido cargado por users que incumple las normas (CU56).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'metric.view',
    name: 'Consultar métricas del sistema',
    description: 'Ver el panel de control con los indicadores (CU58, REP-01).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'role.list',
    name: 'Listar roles',
    description: 'Ver los roles definidos en el sistema (CU62).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'role.create',
    name: 'Create roles',
    description: 'Dar de alta un role nuevo (CU62).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'role.update',
    name: 'Editar roles',
    description: 'Modificar el name o la descripción de un role (CU62).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'role.delete',
    name: 'Delete roles',
    description: 'Dar de baja un role (CU62).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'permission.list',
    name: 'Listar permissions',
    description: 'Ver los permissions disponibles en el sistema (CU61).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'permission.assign',
    name: 'Asignar permissions a un role',
    description: 'Otorgar o revocar permissions envelope un role (CU61).',
    roles: SOLO_ADMINISTRADOR,
  },
];

/** Statuses de la cuenta de un user (CU2, CU7, CU57). Los filtra REP-02. */
export const USER_STATUSES: readonly CatalogValue[] = [
  {
    key: 'active',
    name: 'Activo',
    description: 'La cuenta puede iniciar sesión y usar el sistema.',
  },
  {
    key: 'suspended',
    name: 'Suspendido',
    description:
      'Acceso bloqueado temporalmente por una decisión de administración (CU57).',
  },
  {
    key: 'banned',
    name: 'Baneado',
    description:
      'Acceso bloqueado de forma permanente por incumplir las normas de uso.',
  },
];

/** Statuses de un plan (CU22, CU26, CU60). */
export const PLAN_STATUSES: readonly CatalogValue[] = [
  {
    key: 'generated',
    name: 'Generado',
    description:
      'Lo devolvió el motor de recomendación y el user todavía no lo eligió (CU17).',
  },
  {
    key: 'selected',
    name: 'Seleccionado',
    description:
      'El user lo eligió entre los plans que devolvió su request (CU22).',
  },
  {
    key: 'confirmed',
    name: 'Confirmado',
    description: 'El user confirmó que va a realizarlo.',
  },
  {
    key: 'completed',
    name: 'Finalizado',
    description:
      'Ya ocurrió: habilita cargar la retroalimentación de la experiencia (CU23).',
  },
  {
    key: 'cancelled',
    name: 'Cancelado',
    description: 'Se dio de baja antes de realizarse (CU26).',
  },
];

/** Statuses de una categoría del catálogo (CU54). */
export const CATEGORY_STATUSES: readonly CatalogValue[] = [
  {
    key: 'active',
    name: 'Activa',
    description:
      'Se ofrece en los filtros de búsqueda y pesa en la recomendación (CU10).',
  },
  {
    key: 'inactive',
    name: 'Inactiva',
    description:
      'Deja de ofrecerse, pero sigue asignada a las activities que ya la tienen.',
  },
];

/** Statuses del procesamiento de una retroalimentación (CU21, CU23, CU59). */
export const FEEDBACK_STATUSES: readonly CatalogValue[] = [
  {
    key: 'pending',
    name: 'Pendiente',
    description:
      'La dejó el user y todavía no se incorporó al model de recomendación.',
  },
  {
    key: 'processed',
    name: 'Procesada',
    description: 'Ya se usó para ajustar las recommendationes del user (CU21).',
  },
  {
    key: 'discarded',
    name: 'Descartada',
    description: 'Se revisó y se decidió no incorporarla (CU59).',
  },
];

/** Status con el que nacen las categorías del catálogo inicial. */
export const INITIAL_CATEGORY_STATUS = 'active';

/**
 * `category` no es una table de catálogo: no tiene `key`, y lo que la
 * identifica es el `name` (único mientras no esté dada de baja).
 */
export interface CategoryDefinition {
  name: string;
  description: string;
}

/**
 * Categorías iniciales del catálogo (CU54).
 *
 * Son las diez que la documentación fija como chips de selección múltiple en el
 * onboarding de preferences (US de signup, PAN 15). Arrancar con la misma
 * list que muestra el diseño evita que el front tenga que inventar categorías
 * que la base no conoce.
 */
export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    name: 'Gastronomía',
    description: 'Restaurantes, bodegas, cafés y experiencias de comida.',
  },
  {
    name: 'Aire libre',
    description: 'Parques, cerros, trekking y activities al aire libre.',
  },
  {
    name: 'Cultura',
    description: 'Museos, teatro, patrimonio y visitas guiadas.',
  },
  {
    name: 'Entretenimiento',
    description: 'Cine, juegos, parques temáticos y espectáculos.',
  },
  {
    name: 'Vida nocturna',
    description: 'Bares, boliches y salidas de noche.',
  },
  {
    name: 'Deporte',
    description: 'Activities deportivas para practicar o para mirar.',
  },
  {
    name: 'Música en vivo',
    description: 'Recitales, peñas y shows con música en vivo.',
  },
  {
    name: 'Bienestar',
    description: 'Spa, termas, yoga y activities de relajación.',
  },
  {
    name: 'Compras',
    description: 'Ferias, mercados, paseos de compras y artesanías.',
  },
  {
    name: 'Viajes cortos',
    description: 'Escapadas de un día a destinations cercanos.',
  },
];
