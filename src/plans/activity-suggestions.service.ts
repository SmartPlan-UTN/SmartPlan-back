import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivitySuggestionDto } from './dto/activity-suggestion.dto';
import { ActivitySuggestionsQueryDto } from './dto/activity-suggestions-query.dto';

export const MAX_ACTIVITY_SUGGESTIONS = 6;

/** Distinct words taken from the text; more add noise, not precision. */
const MAX_SEARCH_TERMS = 12;

/**
 * "Recomendar actividades" in the plan editor (#98): catalog activities that
 * match what the person wrote in the title and description.
 *
 * It is a PostgreSQL full-text search over each activity's name (weighted
 * highest), categories, and description, not a Gemini call: the API never
 * calls Gemini synchronously (`skills/05-architecture`), and the editor needs
 * an instant answer. Activities in the same department as the ones already in
 * the plan rank higher, so suggestions stay walkable.
 */
@Injectable()
export class ActivitySuggestionsService {
  constructor(private readonly dataSource: DataSource) {}

  async suggest(
    query: ActivitySuggestionsQueryDto,
  ): Promise<{ data: ActivitySuggestionDto[] }> {
    const terms = searchTerms(`${query.title} ${query.description ?? ''}`);
    if (terms.length === 0) return { data: [] };

    const rows = await this.dataSource.query<
      Array<{
        id: number;
        name: string;
        description: string;
        estimatedCost: string;
        estimatedDuration: number;
        type: string | null;
        categories: string[];
      }>
    >(
      `
        WITH "search" AS (
          SELECT to_tsquery('spanish', $1) AS "query"
        ),
        "planDepartment" AS (
          SELECT DISTINCT "place"."id_department"
          FROM "activity_place"
          INNER JOIN "place"
            ON "place"."id" = "activity_place"."id_place"
           AND "place"."deleted_at" IS NULL
          WHERE "activity_place"."id_activity" = ANY($2::int[])
            AND "activity_place"."deleted_at" IS NULL
        ),
        "candidate" AS (
          SELECT
            "activity"."id",
            "activity"."name",
            "activity"."description",
            "activity"."estimated_cost",
            "activity"."estimated_duration",
            "activity"."type",
            COALESCE(
              array_agg(DISTINCT "category"."name")
                FILTER (WHERE "category"."name" IS NOT NULL),
              '{}'
            ) AS "categories",
            setweight(to_tsvector('spanish', "activity"."name"), 'A')
              || setweight(to_tsvector('spanish',
                   COALESCE(string_agg(DISTINCT "category"."name", ' '), '')), 'B')
              || setweight(to_tsvector('spanish', "activity"."description"), 'C')
              AS "document"
          FROM "activity"
          LEFT JOIN "activity_category"
            ON "activity_category"."id_activity" = "activity"."id"
           AND "activity_category"."deleted_at" IS NULL
          LEFT JOIN "category"
            ON "category"."id" = "activity_category"."id_category"
           AND "category"."deleted_at" IS NULL
           AND EXISTS (
             SELECT 1 FROM "category_status"
             WHERE "category_status"."id" = "category"."id_category_status"
               AND "category_status"."key" = 'active'
           )
          WHERE "activity"."deleted_at" IS NULL
            AND NOT ("activity"."id" = ANY($2::int[]))
          GROUP BY "activity"."id"
        )
        SELECT
          "candidate"."id",
          "candidate"."name",
          "candidate"."description",
          "candidate"."estimated_cost" AS "estimatedCost",
          "candidate"."estimated_duration" AS "estimatedDuration",
          "candidate"."type",
          "candidate"."categories"
        FROM "candidate", "search"
        WHERE "candidate"."document" @@ "search"."query"
        ORDER BY
          ts_rank("candidate"."document", "search"."query")
            + CASE WHEN EXISTS (
                SELECT 1
                FROM "activity_place"
                INNER JOIN "place"
                  ON "place"."id" = "activity_place"."id_place"
                 AND "place"."deleted_at" IS NULL
                WHERE "activity_place"."id_activity" = "candidate"."id"
                  AND "activity_place"."deleted_at" IS NULL
                  AND "place"."id_department" IN (
                    SELECT "id_department" FROM "planDepartment"
                  )
              ) THEN 0.1 ELSE 0 END DESC,
          "candidate"."id" ASC
        LIMIT $3
      `,
      [
        terms.map((term) => `${term}:*`).join(' | '),
        query.excludeActivityIds ?? [],
        MAX_ACTIVITY_SUGGESTIONS,
      ],
    );

    return {
      data: rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        description: row.description,
        estimatedCost: Number(row.estimatedCost),
        estimatedDuration: Number(row.estimatedDuration),
        type: row.type,
        categories: row.categories,
      })),
    };
  }
}

/**
 * The words of `text` as safe `tsquery` operands: letters and digits only,
 * so nothing a person types can break the query syntax. Words shorter than
 * three characters ("de", "la", "y") never help and are dropped.
 */
export function searchTerms(text: string): string[] {
  const words = text
    .toLocaleLowerCase('es')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3);
  return [...new Set(words)].slice(0, MAX_SEARCH_TERMS);
}
