import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { validationPipeOptions } from '../../common/validation/configure-validation';
import { UpdatePreferencesDto } from './update-preferences.dto';

describe('UpdatePreferencesDto', () => {
  const pipe = new ValidationPipe(validationPipeOptions);
  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdatePreferencesDto,
  };

  const transform = (body: unknown): Promise<unknown> =>
    pipe.transform(body, metadata);

  const area = {
    label: 'Godoy Cruz, Mendoza',
    placeId: 'ChIJ_placeholder_place_id',
    latitude: -32.9267,
    longitude: -68.8417,
  };

  it('accepts categories alone (scalar profile is optional)', async () => {
    await expect(transform({ categoryIds: [1, 2] })).resolves.toEqual({
      categoryIds: [1, 2],
    });
  });

  it('accepts the full scalar profile', async () => {
    await expect(
      transform({
        categoryIds: [],
        usualBudget: 35000,
        usualPeopleCount: 3,
        preferredArea: area,
        useDeviceLocation: true,
        maxDistanceKm: 20,
      }),
    ).resolves.toMatchObject({
      usualBudget: 35000,
      maxDistanceKm: 20,
      preferredArea: { placeId: area.placeId, latitude: area.latitude },
    });
  });

  it('lets an explicit null through as an intentional clear', async () => {
    await expect(
      transform({
        categoryIds: [],
        usualBudget: null,
        usualPeopleCount: null,
        preferredArea: null,
        maxDistanceKm: null,
      }),
    ).resolves.toMatchObject({ usualBudget: null, preferredArea: null });
  });

  it('still requires categoryIds', async () => {
    await expect(transform({ usualBudget: 100 })).rejects.toMatchObject({
      status: 400,
    });
  });

  it.each([
    ['zero budget', { categoryIds: [], usualBudget: 0 }],
    ['negative budget', { categoryIds: [], usualBudget: -5 }],
    ['zero party size', { categoryIds: [], usualPeopleCount: 0 }],
    ['fractional party size', { categoryIds: [], usualPeopleCount: 2.5 }],
    ['distance below range', { categoryIds: [], maxDistanceKm: 0 }],
    ['distance above range', { categoryIds: [], maxDistanceKm: 51 }],
    ['non-boolean device flag', { categoryIds: [], useDeviceLocation: 'yes' }],
    [
      'preferred area without coordinates',
      { categoryIds: [], preferredArea: { label: 'x', placeId: 'y' } },
    ],
    [
      'preferred area with an out-of-range latitude',
      { categoryIds: [], preferredArea: { ...area, latitude: 200 } },
    ],
    [
      'preferred area with an empty label',
      { categoryIds: [], preferredArea: { ...area, label: '' } },
    ],
  ])('rejects %s', async (_label, body) => {
    await expect(transform(body)).rejects.toMatchObject({ status: 400 });
  });
});
