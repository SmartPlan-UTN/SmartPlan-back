import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { App } from 'supertest/types';
import { Activity } from '../src/activities/entities/activity.entity';
import { Country } from '../src/places/entities/country.entity';
import { createTestApp } from './create-test-app';

describe('Modelo de data (e2e)', () => {
  let app: INestApplication<App>;
  let activities: Repository<Activity>;
  let countries: Repository<Country>;

  beforeAll(async () => {
    app = await createTestApp();
    const data = app.get(DataSource);
    activities = data.getRepository(Activity);
    countries = data.getRepository(Country);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await activities.deleteAll();
    await countries.deleteAll();
  });

  it('reutiliza una key única después de una baja lógica', async () => {
    const eliminado = await countries.save(
      countries.create({ name: 'Argentina', description: null }),
    );
    await countries.softRemove(eliminado);

    await expect(
      countries.save(
        countries.create({ name: 'Argentina', description: null }),
      ),
    ).resolves.toMatchObject({ name: 'Argentina' });

    await expect(countries.count({ withDeleted: true })).resolves.toBe(2);
    await expect(countries.count()).resolves.toBe(1);
  });

  it('rechaza valores que violan las restricciones del dominio', async () => {
    const invalida = activities.create({
      name: 'Activity inválida',
      description: 'No debe persistirse',
      estimatedCost: -1,
      estimatedDuration: 0,
    });

    await expect(activities.save(invalida)).rejects.toThrow();
    await expect(activities.count()).resolves.toBe(0);
  });
});
