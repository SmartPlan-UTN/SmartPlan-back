import { BadRequestException } from '@nestjs/common';
import { ExplorationQueryDto } from './exploration-query.dto';

export function validateExplorationQuery(
  query: ExplorationQueryDto,
  sortsByDistance: boolean,
): void {
  if (
    query.minPrice !== undefined &&
    query.maxPrice !== undefined &&
    query.minPrice > query.maxPrice
  ) {
    throw new BadRequestException({
      code: 'INVALID_PRICE_RANGE',
      message: 'El precio mínimo no puede superar el precio máximo',
    });
  }

  const hasLatitude = query.latitude !== undefined;
  const hasLongitude = query.longitude !== undefined;
  const hasMaximumDistance = query.maxDistanceKm !== undefined;
  const hasAnyLocationValue =
    hasLatitude || hasLongitude || hasMaximumDistance || sortsByDistance;

  if (
    hasAnyLocationValue &&
    (!hasLatitude || !hasLongitude || (!hasMaximumDistance && !sortsByDistance))
  ) {
    throw new BadRequestException({
      code: 'INCOMPLETE_LOCATION_FILTER',
      message:
        'La ubicación requiere latitude, longitude y maxDistanceKm; el orden por distancia requiere latitude y longitude',
    });
  }
}
