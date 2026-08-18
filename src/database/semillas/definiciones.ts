/**
 * Definición de los datos semilla del sistema (F09).
 *
 * Acá está **qué** se siembra; en `sembrar.ts` está **cómo**. Separarlos permite
 * revisar los valores del dominio —que salen de los casos de uso y del diagrama
 * de clases— sin leer la mecánica de idempotencia, y testear las definiciones
 * sin necesidad de base de datos (`definiciones.spec.ts`).
 *
 * Nada de esto es opcional: sin roles, permisos ni estados, un registro de
 * usuario (CU2) no tiene a qué apuntar sus claves foráneas y la autenticación no
 * puede arrancar.
 */

/**
 * Límites de las columnas de `EntidadCatalogo`. Están replicados acá para que
 * `definiciones.spec.ts` pueda verificar que ningún valor se pase de largo sin
 * levantar la base: un `varchar(40)` desbordado recién falla al insertar.
 */
export const LARGO_MAXIMO = {
  key: 40,
  nombre: 80,
  descripcion: 200,
} as const;

/** Clave del rol de la persona que usa la aplicación. */
export const ROL_USUARIO = 'usuario';

/** Clave del rol que administra el sistema. */
export const ROL_ADMINISTRADOR = 'administrador';

export type ClaveDeRol = typeof ROL_USUARIO | typeof ROL_ADMINISTRADOR;

/** Forma común de todo valor de catálogo (`rol`, `permiso`, `estado_*`). */
export interface ValorDeCatalogo {
  key: string;
  nombre: string;
  descripcion: string;
}

/**
 * Un permiso más los roles que lo reciben de arranque.
 *
 * La asignación viaja **dentro** del permiso y no en una lista aparte a
 * propósito: una lista suelta de claves se desincroniza en cuanto alguien
 * renombra un permiso, y el error recién aparece al correr la semilla.
 */
export interface DefinicionDePermiso extends ValorDeCatalogo {
  roles: readonly ClaveDeRol[];
}

const AMBOS: readonly ClaveDeRol[] = [ROL_USUARIO, ROL_ADMINISTRADOR];
const SOLO_ADMINISTRADOR: readonly ClaveDeRol[] = [ROL_ADMINISTRADOR];

/**
 * Roles del sistema (CU62). Son los dos que reconoce la documentación: el resto
 * de los perfiles se arma otorgando permisos, no creando roles nuevos.
 */
export const ROLES: readonly ValorDeCatalogo[] = [
  {
    key: ROL_USUARIO,
    nombre: 'Usuario',
    descripcion:
      'Persona registrada que genera, guarda y valora sus propios planes.',
  },
  {
    key: ROL_ADMINISTRADOR,
    nombre: 'Administrador',
    descripcion:
      'Gestiona el catálogo, los usuarios y la moderación del sistema.',
  },
];

/**
 * Permisos del sistema (CU61). La `key` tiene el formato `recurso.accion` que
 * espera el guard de autorización (ver `permiso.entity.ts`).
 *
 * El administrador recibe **también** los permisos de usuario: administra el
 * sistema, pero además lo usa —genera planes, guarda favoritos, valora—, y un
 * perfil que no puede hacer nada de eso obligaría a mantener dos cuentas por
 * persona.
 */
export const PERMISOS: readonly DefinicionDePermiso[] = [
  // Perfil y cuenta propia — CU5, CU6, CU7, CU8, CU18
  {
    key: 'perfil.consultar',
    nombre: 'Consultar el perfil propio',
    descripcion: 'Ver los datos de la cuenta propia.',
    roles: AMBOS,
  },
  {
    key: 'perfil.editar',
    nombre: 'Editar el perfil propio',
    descripcion: 'Modificar los datos de la cuenta propia (CU5).',
    roles: AMBOS,
  },
  {
    key: 'perfil.cambiar-contrasena',
    nombre: 'Cambiar la contraseña propia',
    descripcion: 'Reemplazar la contraseña de la cuenta propia (CU6).',
    roles: AMBOS,
  },
  {
    key: 'perfil.eliminar',
    nombre: 'Eliminar la cuenta propia',
    descripcion: 'Dar de baja la cuenta propia (CU7).',
    roles: AMBOS,
  },
  {
    key: 'preferencia.editar',
    nombre: 'Editar las preferencias propias',
    descripcion:
      'Elegir las categorías y los parámetros que alimentan la recomendación (CU8, CU18).',
    roles: AMBOS,
  },

  // Catálogo de actividades — CU9, CU10, CU11, CU14, CU16, CU53
  {
    key: 'actividad.listar',
    nombre: 'Listar actividades',
    descripcion:
      'Buscar, filtrar y ordenar el catálogo de actividades (CU9, CU10, CU11, CU16).',
    roles: AMBOS,
  },
  {
    key: 'actividad.consultar',
    nombre: 'Consultar una actividad',
    descripcion: 'Ver el detalle de una actividad del catálogo (CU14).',
    roles: AMBOS,
  },
  {
    key: 'actividad.crear',
    nombre: 'Crear actividades',
    descripcion: 'Dar de alta una actividad en el catálogo (CU53).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'actividad.editar',
    nombre: 'Editar actividades',
    descripcion: 'Modificar una actividad del catálogo (CU53).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'actividad.eliminar',
    nombre: 'Eliminar actividades',
    descripcion: 'Dar de baja una actividad del catálogo (CU53).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Categorías — CU10, CU54
  {
    key: 'categoria.listar',
    nombre: 'Listar categorías',
    descripcion:
      'Ver las categorías disponibles para filtrar y elegir preferencias (CU10).',
    roles: AMBOS,
  },
  {
    key: 'categoria.crear',
    nombre: 'Crear categorías',
    descripcion: 'Dar de alta una categoría del catálogo (CU54).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'categoria.editar',
    nombre: 'Editar categorías',
    descripcion: 'Modificar o desactivar una categoría del catálogo (CU54).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'categoria.eliminar',
    nombre: 'Eliminar categorías',
    descripcion: 'Dar de baja una categoría del catálogo (CU54).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Planes — CU12, CU13, CU17, CU19, CU22, CU24 a CU31, CU60
  {
    key: 'plan.listar',
    nombre: 'Listar planes',
    descripcion: 'Buscar planes propios y recomendados (CU12, CU20).',
    roles: AMBOS,
  },
  {
    key: 'plan.consultar',
    nombre: 'Consultar un plan',
    descripcion:
      'Ver el detalle de un plan con sus actividades y su costo (CU13, CU29, CU30).',
    roles: AMBOS,
  },
  {
    key: 'plan.generar',
    nombre: 'Generar planes automáticos',
    descripcion:
      'Pedirle al motor de recomendación un plan a partir de una solicitud (CU17, CU19, CU31).',
    roles: AMBOS,
  },
  {
    key: 'plan.seleccionar',
    nombre: 'Seleccionar un plan',
    descripcion: 'Elegir uno de los planes que devolvió una solicitud (CU22).',
    roles: AMBOS,
  },
  {
    key: 'plan.crear',
    nombre: 'Crear planes propios',
    descripcion: 'Armar un plan a mano, sin pasar por el motor (CU24).',
    roles: AMBOS,
  },
  {
    key: 'plan.editar',
    nombre: 'Editar planes propios',
    descripcion:
      'Modificar un plan propio y agregarle o quitarle actividades (CU25, CU27, CU28).',
    roles: AMBOS,
  },
  {
    key: 'plan.eliminar',
    nombre: 'Eliminar planes propios',
    descripcion: 'Dar de baja un plan propio (CU26).',
    roles: AMBOS,
  },
  {
    key: 'plan.gestionar',
    nombre: 'Gestionar planes de cualquier usuario',
    descripcion:
      'Editar o dar de baja planes que no son propios, desde la administración (CU60).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Retroalimentación — CU21, CU23, CU59
  {
    key: 'retroalimentacion.registrar',
    nombre: 'Registrar retroalimentación',
    descripcion:
      'Dejar la devolución posterior a una experiencia, que alimenta la recomendación (CU23).',
    roles: AMBOS,
  },
  {
    key: 'retroalimentacion.revisar',
    nombre: 'Revisar retroalimentación',
    descripcion:
      'Revisar las sugerencias de los usuarios y decidir si se incorporan (CU59).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Colecciones — CU32 a CU38
  {
    key: 'coleccion.listar',
    nombre: 'Listar colecciones propias',
    descripcion: 'Ver las colecciones armadas por uno mismo (CU38).',
    roles: AMBOS,
  },
  {
    key: 'coleccion.consultar',
    nombre: 'Consultar una colección',
    descripcion:
      'Ver el detalle de una colección propia y sus actividades (CU37).',
    roles: AMBOS,
  },
  {
    key: 'coleccion.crear',
    nombre: 'Crear colecciones',
    descripcion: 'Armar una colección de actividades (CU32).',
    roles: AMBOS,
  },
  {
    key: 'coleccion.editar',
    nombre: 'Editar colecciones propias',
    descripcion:
      'Renombrar una colección propia y agregarle o quitarle actividades (CU33, CU35, CU36).',
    roles: AMBOS,
  },
  {
    key: 'coleccion.eliminar',
    nombre: 'Eliminar colecciones propias',
    descripcion: 'Dar de baja una colección propia (CU34).',
    roles: AMBOS,
  },

  // Favoritos — CU15, CU39 a CU43
  {
    key: 'favorito.listar',
    nombre: 'Listar favoritos propios',
    descripcion: 'Ver las actividades y los planes guardados (CU39, CU40).',
    roles: AMBOS,
  },
  {
    key: 'favorito.guardar',
    nombre: 'Guardar en favoritos',
    descripcion:
      'Guardar una actividad o un plan en la lista de favoritos (CU15, CU43).',
    roles: AMBOS,
  },
  {
    key: 'favorito.quitar',
    nombre: 'Quitar de favoritos',
    descripcion:
      'Sacar una actividad o un plan de la lista de favoritos (CU41, CU42).',
    roles: AMBOS,
  },

  // Valoraciones — CU44 a CU47, CU55
  {
    key: 'valoracion.listar',
    nombre: 'Listar valoraciones',
    descripcion: 'Ver las valoraciones publicadas (CU45).',
    roles: AMBOS,
  },
  {
    key: 'valoracion.crear',
    nombre: 'Crear valoraciones',
    descripcion: 'Puntuar y comentar una experiencia realizada (CU44).',
    roles: AMBOS,
  },
  {
    key: 'valoracion.editar',
    nombre: 'Editar valoraciones propias',
    descripcion: 'Modificar una valoración propia (CU46).',
    roles: AMBOS,
  },
  {
    key: 'valoracion.eliminar',
    nombre: 'Eliminar valoraciones propias',
    descripcion: 'Dar de baja una valoración propia (CU47).',
    roles: AMBOS,
  },
  {
    key: 'valoracion.moderar',
    nombre: 'Moderar valoraciones',
    descripcion: 'Aprobar o rechazar valoraciones de cualquier usuario (CU55).',
    roles: SOLO_ADMINISTRADOR,
  },

  // Administración — CU56, CU57, CU58, CU61, CU62
  {
    key: 'usuario.listar',
    nombre: 'Listar usuarios',
    descripcion: 'Ver el listado de usuarios del sistema (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'usuario.consultar',
    nombre: 'Consultar un usuario',
    descripcion: 'Ver la ficha de un usuario del sistema (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'usuario.editar',
    nombre: 'Editar usuarios',
    descripcion: 'Modificar los datos y el rol de un usuario (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'usuario.cambiar-estado',
    nombre: 'Cambiar el estado de un usuario',
    descripcion: 'Suspender, banear o reactivar una cuenta (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'usuario.eliminar',
    nombre: 'Eliminar usuarios',
    descripcion: 'Dar de baja la cuenta de un usuario (CU57).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'contenido.eliminar',
    nombre: 'Eliminar contenido',
    descripcion:
      'Dar de baja contenido cargado por usuarios que incumple las normas (CU56).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'metrica.consultar',
    nombre: 'Consultar métricas del sistema',
    descripcion: 'Ver el panel de control con los indicadores (CU58, REP-01).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'rol.listar',
    nombre: 'Listar roles',
    descripcion: 'Ver los roles definidos en el sistema (CU62).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'rol.crear',
    nombre: 'Crear roles',
    descripcion: 'Dar de alta un rol nuevo (CU62).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'rol.editar',
    nombre: 'Editar roles',
    descripcion: 'Modificar el nombre o la descripción de un rol (CU62).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'rol.eliminar',
    nombre: 'Eliminar roles',
    descripcion: 'Dar de baja un rol (CU62).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'permiso.listar',
    nombre: 'Listar permisos',
    descripcion: 'Ver los permisos disponibles en el sistema (CU61).',
    roles: SOLO_ADMINISTRADOR,
  },
  {
    key: 'permiso.asignar',
    nombre: 'Asignar permisos a un rol',
    descripcion: 'Otorgar o revocar permisos sobre un rol (CU61).',
    roles: SOLO_ADMINISTRADOR,
  },
];

/** Estados de la cuenta de un usuario (CU2, CU7, CU57). Los filtra REP-02. */
export const ESTADOS_DE_USUARIO: readonly ValorDeCatalogo[] = [
  {
    key: 'activo',
    nombre: 'Activo',
    descripcion: 'La cuenta puede iniciar sesión y usar el sistema.',
  },
  {
    key: 'suspendido',
    nombre: 'Suspendido',
    descripcion:
      'Acceso bloqueado temporalmente por una decisión de administración (CU57).',
  },
  {
    key: 'baneado',
    nombre: 'Baneado',
    descripcion:
      'Acceso bloqueado de forma permanente por incumplir las normas de uso.',
  },
];

/** Estados de un plan (CU22, CU26, CU60). */
export const ESTADOS_DE_PLAN: readonly ValorDeCatalogo[] = [
  {
    key: 'generado',
    nombre: 'Generado',
    descripcion:
      'Lo devolvió el motor de recomendación y el usuario todavía no lo eligió (CU17).',
  },
  {
    key: 'seleccionado',
    nombre: 'Seleccionado',
    descripcion:
      'El usuario lo eligió entre los planes que devolvió su solicitud (CU22).',
  },
  {
    key: 'confirmado',
    nombre: 'Confirmado',
    descripcion: 'El usuario confirmó que va a realizarlo.',
  },
  {
    key: 'finalizado',
    nombre: 'Finalizado',
    descripcion:
      'Ya ocurrió: habilita cargar la retroalimentación de la experiencia (CU23).',
  },
  {
    key: 'cancelado',
    nombre: 'Cancelado',
    descripcion: 'Se dio de baja antes de realizarse (CU26).',
  },
];

/** Estados de una categoría del catálogo (CU54). */
export const ESTADOS_DE_CATEGORIA: readonly ValorDeCatalogo[] = [
  {
    key: 'activa',
    nombre: 'Activa',
    descripcion:
      'Se ofrece en los filtros de búsqueda y pesa en la recomendación (CU10).',
  },
  {
    key: 'inactiva',
    nombre: 'Inactiva',
    descripcion:
      'Deja de ofrecerse, pero sigue asignada a las actividades que ya la tienen.',
  },
];

/** Estados del procesamiento de una retroalimentación (CU21, CU23, CU59). */
export const ESTADOS_DE_RETROALIMENTACION: readonly ValorDeCatalogo[] = [
  {
    key: 'pendiente',
    nombre: 'Pendiente',
    descripcion:
      'La dejó el usuario y todavía no se incorporó al modelo de recomendación.',
  },
  {
    key: 'procesada',
    nombre: 'Procesada',
    descripcion:
      'Ya se usó para ajustar las recomendaciones del usuario (CU21).',
  },
  {
    key: 'descartada',
    nombre: 'Descartada',
    descripcion: 'Se revisó y se decidió no incorporarla (CU59).',
  },
];

/** Estado con el que nacen las categorías del catálogo inicial. */
export const ESTADO_DE_CATEGORIA_INICIAL = 'activa';

/**
 * `categoria` no es una tabla de catálogo: no tiene `key`, y lo que la
 * identifica es el `nombre` (único mientras no esté dada de baja).
 */
export interface DefinicionDeCategoria {
  nombre: string;
  descripcion: string;
}

/**
 * Categorías iniciales del catálogo (CU54).
 *
 * Son las diez que la documentación fija como chips de selección múltiple en el
 * onboarding de preferencias (US de registro, PAN 15). Arrancar con la misma
 * lista que muestra el diseño evita que el front tenga que inventar categorías
 * que la base no conoce.
 */
export const CATEGORIAS: readonly DefinicionDeCategoria[] = [
  {
    nombre: 'Gastronomía',
    descripcion: 'Restaurantes, bodegas, cafés y experiencias de comida.',
  },
  {
    nombre: 'Aire libre',
    descripcion: 'Parques, cerros, trekking y actividades al aire libre.',
  },
  {
    nombre: 'Cultura',
    descripcion: 'Museos, teatro, patrimonio y visitas guiadas.',
  },
  {
    nombre: 'Entretenimiento',
    descripcion: 'Cine, juegos, parques temáticos y espectáculos.',
  },
  {
    nombre: 'Vida nocturna',
    descripcion: 'Bares, boliches y salidas de noche.',
  },
  {
    nombre: 'Deporte',
    descripcion: 'Actividades deportivas para practicar o para mirar.',
  },
  {
    nombre: 'Música en vivo',
    descripcion: 'Recitales, peñas y shows con música en vivo.',
  },
  {
    nombre: 'Bienestar',
    descripcion: 'Spa, termas, yoga y actividades de relajación.',
  },
  {
    nombre: 'Compras',
    descripcion: 'Ferias, mercados, paseos de compras y artesanías.',
  },
  {
    nombre: 'Viajes cortos',
    descripcion: 'Escapadas de un día a destinos cercanos.',
  },
];
