import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** The activities already on the route, in order: the only context Gemini gets. */
class RouteContextDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  stopActivityIds: number[];
}

/** `POST /users/me/plans/assistant/search` */
export class AssistantSearchDto extends RouteContextDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(2, 300)
  query: string;
}

/** `POST /users/me/plans/assistant/suggest` */
export class AssistantSuggestDto extends RouteContextDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 150)
  title: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  description?: string;
}

/** `POST /users/me/plans/assistant/improve` */
export class AssistantImproveDto extends RouteContextDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @Length(1, 150)
  title: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  declare stopActivityIds: number[];
}
