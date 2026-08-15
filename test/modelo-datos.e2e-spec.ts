import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { App } from 'supertest/types';
import { Actividad } from '../src/actividades/entities/actividad.entity';
import { Pais } from '../src/lugares/entities/pais.entity';
import { crearAppDePrueba } from './crear-app-de-prueba';

describe('Modelo de datos (e2e)', () => {
  let app: INestApplication<App>;
  let actividades: Repository<Actividad>;
  let paises: Repository<Pais>;

  beforeAll(async () => {
    app = await crearAppDePrueba();
    const datos = app.get(DataSource);
    actividades = datos.getRepository(Actividad);
    paises = datos.getRepository(Pais);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await actividades.deleteAll();
    await paises.deleteAll();
  });

  it('reutiliza una clave única después de una baja lógica', async () => {
    const eliminado = await paises.save(
      paises.create({ nombre: 'Argentina', descripcion: null }),
    );
    await paises.softRemove(eliminado);

    await expect(
      paises.save(paises.create({ nombre: 'Argentina', descripcion: null })),
    ).resolves.toMatchObject({ nombre: 'Argentina' });

    await expect(paises.count({ withDeleted: true })).resolves.toBe(2);
    await expect(paises.count()).resolves.toBe(1);
  });

  it('rechaza valores que violan las restricciones del dominio', async () => {
    const invalida = actividades.create({
      nombre: 'Actividad inválida',
      descripcion: 'No debe persistirse',
      costoEstimado: -1,
      duracionEstimada: 0,
    });

    await expect(actividades.save(invalida)).rejects.toThrow();
    await expect(actividades.count()).resolves.toBe(0);
  });
});
