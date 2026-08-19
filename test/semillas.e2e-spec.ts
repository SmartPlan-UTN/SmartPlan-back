import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { DataSource, ObjectLiteral, Repository } from 'typeorm';
import { Categoria } from '../src/categorias/entities/categoria.entity';
import { EstadoCategoria } from '../src/categorias/entities/estado-categoria.entity';
import {
  CATEGORIAS,
  ESTADOS_DE_CATEGORIA,
  ESTADOS_DE_PLAN,
  ESTADOS_DE_RETROALIMENTACION,
  ESTADOS_DE_USUARIO,
  PERMISOS,
  ROLES,
} from '../src/database/semillas/definiciones';
import {
  ResumenDeTabla,
  sembrarDatosIniciales,
} from '../src/database/semillas/sembrar';
import { EstadoPlan } from '../src/planes/entities/estado-plan.entity';
import { EstadoRetroalimentacion } from '../src/recomendacion/entities/estado-retroalimentacion.entity';
import { EstadoUsuario } from '../src/usuarios/entities/estado-usuario.entity';
import { Permiso } from '../src/usuarios/entities/permiso.entity';
import { RolPermiso } from '../src/usuarios/entities/rol-permiso.entity';
import { Rol } from '../src/usuarios/entities/rol.entity';
import { crearAppDePrueba } from './crear-app-de-prueba';

/**
 * La semilla contra PostgreSQL de verdad (F09).
 *
 * Es un e2e y no un unitario porque lo que hay que probar es justamente lo que
 * un doble de repositorio no puede reproducir: que la segunda corrida no
 * duplique nada. Eso depende de los índices únicos parciales del modelo y de
 * cómo se comportan frente a la baja lógica, no de la lógica de la función.
 *
 * Las definiciones no se copian acá: los totales esperados se calculan a partir
 * de `definiciones.ts`. Un test que repitiera "49 permisos" habría que
 * actualizarlo cada vez que se suma uno, y lo que estaría verificando es que
 * alguien supo contar, no que la semilla funciona.
 */
describe('Datos semilla (e2e)', () => {
  let app: INestApplication<App>;
  let fuente: DataSource;

  let roles: Repository<Rol>;
  let permisos: Repository<Permiso>;
  let permisosDeRoles: Repository<RolPermiso>;
  let categorias: Repository<Categoria>;
  let estadosDeCategoria: Repository<EstadoCategoria>;

  /** Repositorio de cada tabla que toca la semilla, por nombre de tabla. */
  let sembradas: Map<string, Repository<ObjectLiteral>>;

  /** Cuántas filas tiene que dejar la semilla en cada una de esas tablas. */
  const esperadas: Record<string, number> = {
    rol: ROLES.length,
    permiso: PERMISOS.length,
    estado_usuario: ESTADOS_DE_USUARIO.length,
    estado_plan: ESTADOS_DE_PLAN.length,
    estado_categoria: ESTADOS_DE_CATEGORIA.length,
    estado_retroalimentacion: ESTADOS_DE_RETROALIMENTACION.length,
    rol_permiso: PERMISOS.reduce(
      (total, permiso) => total + permiso.roles.length,
      0,
    ),
    categoria: CATEGORIAS.length,
  };

  beforeAll(async () => {
    app = await crearAppDePrueba();
    fuente = app.get(DataSource);

    roles = fuente.getRepository(Rol);
    permisos = fuente.getRepository(Permiso);
    permisosDeRoles = fuente.getRepository(RolPermiso);
    categorias = fuente.getRepository(Categoria);
    estadosDeCategoria = fuente.getRepository(EstadoCategoria);

    sembradas = new Map<string, Repository<ObjectLiteral>>([
      ['rol', roles],
      ['permiso', permisos],
      ['estado_usuario', fuente.getRepository(EstadoUsuario)],
      ['estado_plan', fuente.getRepository(EstadoPlan)],
      ['estado_categoria', estadosDeCategoria],
      [
        'estado_retroalimentacion',
        fuente.getRepository(EstadoRetroalimentacion),
      ],
      ['rol_permiso', permisosDeRoles],
      ['categoria', categorias],
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Las hijas primero: `categoria` referencia a `estado_categoria` con
    // `RESTRICT`, así que borrarlas al revés falla.
    await permisosDeRoles.deleteAll();
    await categorias.deleteAll();

    for (const [tabla, repositorio] of sembradas) {
      if (tabla !== 'rol_permiso' && tabla !== 'categoria') {
        await repositorio.deleteAll();
      }
    }
  });

  /** El resumen que devuelve la semilla, indexado por tabla. */
  function porTabla(resumen: ResumenDeTabla[]): Record<string, ResumenDeTabla> {
    return Object.fromEntries(resumen.map((fila) => [fila.tabla, fila]));
  }

  /** Cuántas filas activas quedaron en cada tabla sembrada. */
  async function contar(): Promise<Record<string, number>> {
    const conteos: Record<string, number> = {};

    for (const [tabla, repositorio] of sembradas) {
      conteos[tabla] = await repositorio.count();
    }

    return conteos;
  }

  it('siembra roles, permisos, estados y categorías sobre una base vacía', async () => {
    const resumen = porTabla(await sembrarDatosIniciales(fuente));

    for (const [tabla, cantidad] of Object.entries(esperadas)) {
      expect(resumen[tabla]).toEqual({
        tabla,
        creados: cantidad,
        existentes: 0,
      });
    }
    await expect(contar()).resolves.toEqual(esperadas);
  });

  it('no duplica nada al correrla dos veces', async () => {
    await sembrarDatosIniciales(fuente);
    const segunda = porTabla(await sembrarDatosIniciales(fuente));

    for (const [tabla, cantidad] of Object.entries(esperadas)) {
      expect(segunda[tabla]).toEqual({
        tabla,
        creados: 0,
        existentes: cantidad,
      });
    }
    await expect(contar()).resolves.toEqual(esperadas);
  });

  it('deja al administrador con todos los permisos y al usuario con los suyos (CU61)', async () => {
    await sembrarDatosIniciales(fuente);

    const otorgados = async (clave: string): Promise<string[]> => {
      const rol = await roles.findOneByOrFail({ key: clave });
      const asignaciones = await permisosDeRoles.find({
        where: { idRol: rol.id },
        relations: { permiso: true },
      });

      return asignaciones.map((asignacion) => asignacion.permiso.key).sort();
    };

    const deUsuario = PERMISOS.filter((permiso) =>
      permiso.roles.includes('usuario'),
    ).map((permiso) => permiso.key);

    await expect(otorgados('administrador')).resolves.toEqual(
      PERMISOS.map((permiso) => permiso.key).sort(),
    );
    await expect(otorgados('usuario')).resolves.toEqual(deUsuario.sort());
    // Los permisos de administración no llegan al rol de usuario.
    await expect(otorgados('usuario')).resolves.not.toContain('usuario.listar');
  });

  it('deja las categorías iniciales en estado activa (CU54)', async () => {
    await sembrarDatosIniciales(fuente);

    const activa = await estadosDeCategoria.findOneByOrFail({ key: 'activa' });
    const creadas = await categorias.find({ order: { id: 'ASC' } });

    expect(creadas.map((categoria) => categoria.nombre)).toEqual(
      CATEGORIAS.map((categoria) => categoria.nombre),
    );
    for (const categoria of creadas) {
      expect(categoria.idEstadoCategoria).toBe(activa.id);
    }
  });

  it('no revive un valor que fue dado de baja', async () => {
    await sembrarDatosIniciales(fuente);

    const [primera] = await categorias.find({ order: { id: 'ASC' }, take: 1 });
    await categorias.softRemove(primera);

    const resumen = porTabla(await sembrarDatosIniciales(fuente));

    // Una baja lógica es una decisión de la administración (CU54): la semilla
    // la respeta en vez de reponer la fila en el próximo despliegue.
    expect(resumen.categoria.creados).toBe(0);
    await expect(categorias.count()).resolves.toBe(CATEGORIAS.length - 1);
    await expect(categorias.count({ withDeleted: true })).resolves.toBe(
      CATEGORIAS.length,
    );
  });

  it('repone lo que falta sin pisar lo que ya estaba', async () => {
    await sembrarDatosIniciales(fuente);

    const editado = await roles.findOneByOrFail({ key: 'usuario' });
    await roles.update(editado.id, { nombre: 'Usuario final' });
    // El borrado físico se lleva puestas sus asignaciones (`onDelete: CASCADE`),
    // así que la semilla tiene que reponer el permiso y volver a otorgarlo.
    const otorgadas = PERMISOS.find(
      (permiso) => permiso.key === 'plan.generar',
    )!.roles.length;
    await permisos.delete({ key: 'plan.generar' });

    const resumen = porTabla(await sembrarDatosIniciales(fuente));

    expect(resumen.permiso.creados).toBe(1);
    expect(resumen.rol.creados).toBe(0);
    expect(resumen.rol_permiso.creados).toBe(otorgadas);
    await expect(contar()).resolves.toEqual(esperadas);
    // El nombre lo edita la administración (CU62): la semilla no lo pisa.
    await expect(roles.findOneByOrFail({ key: 'usuario' })).resolves.toEqual(
      expect.objectContaining({ nombre: 'Usuario final' }),
    );
  });
});
