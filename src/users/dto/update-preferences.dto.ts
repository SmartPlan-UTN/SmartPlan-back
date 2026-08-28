import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * A preferred area the frontend has already resolved against
 * `GET /external-integration/places/search`. The backend trusts and stores
 * it verbatim (like `plan_request.idDepartment`), so no billed Maps call
 * happens on the write path. `label` is what the user sees; `placeId` +
 * coordinates are what CU19 needs to use it as a search centre.
 */
export class PreferredAreaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  label: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  placeId: string;

  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @Type(() => Number)
  @IsLongitude()
  longitude: number;
}

export class UpdatePreferencesDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  categoryIds: number[];

  /**
   * Scalar recommendation profile (CU8/CU18, PAN 15). Every field is
   * optional and independently clearable: an explicit `null` wipes the
   * stored value, omitting the field leaves it untouched. `@IsOptional`
   * short-circuits validation for both `undefined` and `null`, so `null`
   * always reaches the service as an intentional clear.
   */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  usualBudget?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  usualPeopleCount?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PreferredAreaDto)
  preferredArea?: PreferredAreaDto | null;

  @IsOptional()
  @IsBoolean()
  useDeviceLocation?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxDistanceKm?: number | null;
}
