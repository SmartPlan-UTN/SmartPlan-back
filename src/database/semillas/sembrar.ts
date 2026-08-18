import {
  DataSource,
  EntityManager,
  EntityTarget,
  In,
  Repository,
} from 'typeorm';
import { Categoria } from '../../categorias/entities/categoria.entity';
import { EstadoCategoria } from '../../categorias/entities/estado-categoria.entity';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { EstadoPlan } from '../../planes/entities/estado-plan.entity';
import { EstadoRetroalimentacion } from '../../recomendacion/entities/estado-retroalimentacion.entity';
import { EstadoUsuario } from '../../usuarios/entities/estado-usuario.entity';
import { Permiso } from '../../usuarios/entities/permiso.entity';
import { RolPermiso } from '../../usuarios/entities/rol-permiso.entity';
import { Rol } from '../../usuarios/entities/rol.entity';
import {
  CATEGORIAS,
  ESTADO_DE_CATEGORIA_INICIAL,
  ESTADOS_DE_CATEGORIA,
  ESTADOS_DE_PLAN,
  ESTADOS_DE_RETROALIMENTACION,
  ESTADOS_DE_USUARIO,
  PERMISOS,
  ROLES,
  ValorDeCatalogo,
} from './definiciones';

/**
 * Siembra de los datos mínimos del sistema (F09).
 *
 * ## La regla de idempotencia
 *
 * La semilla **solo inserta lo que falta**. Nunca pisa ni revive una fila que ya
 * está, y por eso correrla dos veces no duplica nada.
 *
 * Que no pise tiene un motivo: `nombre` y `descripcion` de los catálogos son
 * editables desde la administración (CU54, CU61, CU62). Si la semilla los
 * reescribiera, cada despliegue desharía el trabajo del administrador.
 *
 * Que no reviva tiene otro: la existencia se chequea **incluyendo las filas
 * dadas de baja** (`withDeleted: true`). Si alguien dio de baja una categoría,
 * fue a propósito; volver a insertarla en el próximo despliegue sería
 * desautorizarlo en silencio. Además, los índices únicos del modelo son
 * parciales (`WHERE deleted_at IS NULL`), así que sin ese `withDeleted` la
 * semilla insertaría una segunda fila con la misma clave sin que la base la
 * frenara.
 *
 * ## Orden
 *
 * Los catálogos van primero porque `rol_permiso` y `categoria` los referencian.
 * Todo corre dentro de una transacción: o queda sembrado el conjunto completo o
 * no queda nada, nunca una base a medio armar.
 */

/** Lo que dejó la semilla en una tabla. */
export interface ResumenDeTabla {
  tabla: string;
  creados: number;
  existentes: number;
}

export async function sembrarDatosIniciales(
  fuente: DataSource,
): Promise<ResumenDeTabla[]> {
  return fuente.transaction(async (gestor) => {
    const resumen: ResumenDeTabla[] = [];

    resumen.push(await sembrarCatalogo(gestor, Rol, ROLES));
    resumen.push(await sembrarCatalogo(gestor, Permiso, PERMISOS));
    resumen.push(
      await sembrarCatalogo(gestor, EstadoUsuario, ESTADOS_DE_USUARIO),
    );
    resumen.push(await sembrarCatalogo(gestor, EstadoPlan, ESTADOS_DE_PLAN));
    resumen.push(
      await sembrarCatalogo(gestor, EstadoCategoria, ESTADOS_DE_CATEGORIA),
    );
    resumen.push(
      await sembrarCatalogo(
        gestor,
        EstadoRetroalimentacion,
        ESTADOS_DE_RETROALIMENTACION,
      ),
    );
    resumen.push(await sembrarPermisosDeLosRoles(gestor));
    resumen.push(await sembrarCategorias(gestor));

    return resumen;
  });
}

/**
 * Siembra una tabla de catálogo. Sirve para las seis (`rol`, `permiso` y los
 * cuatro `estado_*`) porque todas heredan de `EntidadCatalogo` y se identifican
 * por su `key`.
 */
async function sembrarCatalogo(
  gestor: EntityManager,
  entidad: EntityTarget<EntidadCatalogo>,
  valores: readonly ValorDeCatalogo[],
): Promise<ResumenDeTabla> {
  const repositorio = gestor.getRepository(entidad);

  const filas = await repositorio.find({
    where: { key: In(valores.map((valor) => valor.key)) },
    select: { key: true },
    withDeleted: true,
  });
  const yaEstan = new Set(filas.map((fila) => fila.key));

  const faltantes = valores.filter((valor) => !yaEstan.has(valor.key));
  if (faltantes.length > 0) {
    await repositorio.save(repositorio.create(faltantes));
  }

  return {
    tabla: repositorio.metadata.tableName,
    creados: faltantes.length,
    existentes: valores.length - faltantes.length,
  };
}

/**
 * Siembra `rol_permiso` a partir de los roles que declara cada permiso.
 *
 * Los ids se resuelven por `key` y no se cablean: la clave primaria es un
 * `SERIAL`, así que en dos bases distintas el mismo rol puede tener ids
 * distintos.
 */
async function sembrarPermisosDeLosRoles(
  gestor: EntityManager,
): Promise<ResumenDeTabla> {
  const idsDeRoles = await mapaDeIdsPorClave(gestor.getRepository(Rol));
  const idsDePermisos = await mapaDeIdsPorClave(gestor.getRepository(Permiso));

  const asignaciones = PERMISOS.flatMap((permiso) =>
    permiso.roles.map((rol) => ({
      idRol: exigirId(idsDeRoles, rol, 'rol'),
      idPermiso: exigirId(idsDePermisos, permiso.key, 'permiso'),
    })),
  );

  const repositorio = gestor.getRepository(RolPermiso);
  const filas = await repositorio.find({
    select: { idRol: true, idPermiso: true },
    withDeleted: true,
  });
  const yaEstan = new Set(filas.map(comoPar));

  const faltantes = asignaciones.filter(
    (asignacion) => !yaEstan.has(comoPar(asignacion)),
  );
  if (faltantes.length > 0) {
    await repositorio.save(repositorio.create(faltantes));
  }

  return {
    tabla: repositorio.metadata.tableName,
    creados: faltantes.length,
    existentes: asignaciones.length - faltantes.length,
  };
}

/**
 * Siembra las categorías iniciales del catálogo, todas en estado `activa`.
 *
 * A diferencia de los catálogos, `categoria` no tiene `key`: lo que la
 * identifica es el `nombre`.
 */
async function sembrarCategorias(
  gestor: EntityManager,
): Promise<ResumenDeTabla> {
  const estados = gestor.getRepository(EstadoCategoria);
  const inicial = await estados.findOne({
    where: { key: ESTADO_DE_CATEGORIA_INICIAL },
    withDeleted: true,
  });

  if (!inicial) {
    // No debería pasar: `estado_categoria` se siembra unos renglones antes, en
    // esta misma transacción. Si pasa, es que alguien cambió el orden.
    throw new Error(
      `Falta el estado de categoría "${ESTADO_DE_CATEGORIA_INICIAL}": las ` +
        `categorías no pueden sembrarse antes que sus estados.`,
    );
  }

  const repositorio = gestor.getRepository(Categoria);
  const filas = await repositorio.find({
    where: { nombre: In(CATEGORIAS.map((categoria) => categoria.nombre)) },
    select: { nombre: true },
    withDeleted: true,
  });
  const yaEstan = new Set(filas.map((fila) => fila.nombre));

  const faltantes = CATEGORIAS.filter(
    (categoria) => !yaEstan.has(categoria.nombre),
  ).map((categoria) => ({ ...categoria, idEstadoCategoria: inicial.id }));

  if (faltantes.length > 0) {
    await repositorio.save(repositorio.create(faltantes));
  }

  return {
    tabla: repositorio.metadata.tableName,
    creados: faltantes.length,
    existentes: CATEGORIAS.length - faltantes.length,
  };
}

/** `key` → `id` de una tabla de catálogo. */
async function mapaDeIdsPorClave(
  repositorio: Repository<EntidadCatalogo>,
): Promise<Map<string, number>> {
  const filas = await repositorio.find({
    select: { id: true, key: true },
    withDeleted: true,
    // Si una clave quedó repetida entre una fila dada de baja y su reemplazo,
    // gana la última: `new Map()` se queda con la entrada más nueva.
    order: { id: 'ASC' },
  });

  return new Map(filas.map((fila) => [fila.key, fila.id]));
}

function exigirId(
  ids: Map<string, number>,
  clave: string,
  tabla: string,
): number {
  const id = ids.get(clave);

  if (id === undefined) {
    throw new Error(
      `No existe el ${tabla} con key "${clave}". Revisá que esté declarado en ` +
        `src/database/semillas/definiciones.ts.`,
    );
  }

  return id;
}

/** Identidad de una asignación rol–permiso, para comparar de a conjuntos. */
function comoPar(asignacion: { idRol: number; idPermiso: number }): string {
  return `${asignacion.idRol}:${asignacion.idPermiso}`;
}
