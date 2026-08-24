import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { validateWorkerEnvironment } from '../src/config/worker-environment-variables';
import { DatabaseModule } from '../src/database/database.module';
import { Activity } from '../src/activities/entities/activity.entity';
import { ActivityPlace } from '../src/activities/entities/activity-place.entity';
import { City } from '../src/places/entities/city.entity';
import { Country } from '../src/places/entities/country.entity';
import { Department } from '../src/places/entities/department.entity';
import { Place } from '../src/places/entities/place.entity';
import { GeographicResolutionService } from '../src/recommendation/geographic-resolution.service';

describe('GeographicResolutionService (real Postgres)', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let service: GeographicResolutionService;
  let countryId: number;
  let cityId: number;
  let nearDepartmentId: number;
  let farDepartmentId: number;
  let nearPlaceId: number;
  let farPlaceId: number;
  let nearActivityId: number;
  let farActivityId: number;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
          validate: validateWorkerEnvironment,
        }),
        DatabaseModule,
        TypeOrmModule.forFeature([
          Country,
          City,
          Department,
          Place,
          Activity,
          ActivityPlace,
        ]),
      ],
      providers: [GeographicResolutionService],
    }).compile();

    dataSource = module.get(DataSource);
    service = module.get(GeographicResolutionService);

    const country = await dataSource
      .getRepository(Country)
      .save(
        dataSource
          .getRepository(Country)
          .create({ name: 'Argentina', description: null }),
      );
    countryId = country.id;
    const city = await dataSource.getRepository(City).save(
      dataSource.getRepository(City).create({
        idCountry: country.id,
        name: 'Mendoza',
        description: null,
      }),
    );
    cityId = city.id;

    const nearDepartment = await dataSource.getRepository(Department).save(
      dataSource.getRepository(Department).create({
        idCity: city.id,
        name: 'Godoy Cruz',
        description: null,
      }),
    );
    nearDepartmentId = nearDepartment.id;
    const farDepartment = await dataSource.getRepository(Department).save(
      dataSource.getRepository(Department).create({
        idCity: city.id,
        name: 'Malargüe',
        description: null,
      }),
    );
    farDepartmentId = farDepartment.id;

    const nearPlace = await dataSource.getRepository(Place).save(
      dataSource.getRepository(Place).create({
        idDepartment: nearDepartment.id,
        name: 'Near winery',
        description: null,
        address: 'Near street 1',
      }),
    );
    nearPlaceId = nearPlace.id;
    const farPlace = await dataSource.getRepository(Place).save(
      dataSource.getRepository(Place).create({
        idDepartment: farDepartment.id,
        name: 'Far winery',
        description: null,
        address: 'Far street 1',
      }),
    );
    farPlaceId = farPlace.id;

    const nearActivity = await dataSource.getRepository(Activity).save(
      dataSource.getRepository(Activity).create({
        name: 'Near activity',
        description: 'desc',
        estimatedCost: 1000,
        estimatedDuration: 60,
      }),
    );
    nearActivityId = nearActivity.id;
    const farActivity = await dataSource.getRepository(Activity).save(
      dataSource.getRepository(Activity).create({
        name: 'Far activity',
        description: 'desc',
        estimatedCost: 1000,
        estimatedDuration: 60,
      }),
    );
    farActivityId = farActivity.id;

    // Godoy Cruz, Mendoza
    await dataSource.getRepository(ActivityPlace).save(
      dataSource.getRepository(ActivityPlace).create({
        idActivity: nearActivity.id,
        idPlace: nearPlace.id,
        latitude: -32.9264,
        longitude: -68.8464,
      }),
    );
    // Malargüe, Mendoza (~180km south of Godoy Cruz)
    await dataSource.getRepository(ActivityPlace).save(
      dataSource.getRepository(ActivityPlace).create({
        idActivity: farActivity.id,
        idPlace: farPlace.id,
        latitude: -35.4747,
        longitude: -69.5838,
      }),
    );
  });

  afterAll(async () => {
    await dataSource.getRepository(ActivityPlace).deleteAll();
    await dataSource.getRepository(Activity).delete(nearActivityId);
    await dataSource.getRepository(Activity).delete(farActivityId);
    await dataSource.getRepository(Place).delete(nearPlaceId);
    await dataSource.getRepository(Place).delete(farPlaceId);
    await dataSource.getRepository(Department).delete(nearDepartmentId);
    await dataSource.getRepository(Department).delete(farDepartmentId);
    await dataSource.getRepository(City).delete(cityId);
    await dataSource.getRepository(Country).delete(countryId);
    await module.close();
  });

  it('resolves the department of the nearest activity_place to a GPS point', async () => {
    const result = await service.nearestDepartment(-32.89, -68.84);

    expect(result).toBe(nearDepartmentId);
  });

  it('resolves the other department when the point is closer to it', async () => {
    const result = await service.nearestDepartment(-35.47, -69.58);

    expect(result).toBe(farDepartmentId);
  });

  it('returns null when no activity_place has coordinates', async () => {
    await dataSource
      .getRepository(ActivityPlace)
      .createQueryBuilder()
      .update(ActivityPlace)
      .set({ latitude: null, longitude: null })
      .where('1 = 1')
      .execute();

    const result = await service.nearestDepartment(-32.89, -68.84);

    expect(result).toBeNull();
  });
});
