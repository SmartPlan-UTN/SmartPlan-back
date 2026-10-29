# Hogar v1 — sources and rules

The virtual Hogar ("En casa / donde estén", `kind = home`) holds games and
plans that happen at home or wherever the group is. It belongs to no city:
the same package serves any catalog.

## Content

- Every description is SmartPlan's own short summary of the rules, written
  for this catalog. No text is copied from the references.
- `rulesRef` points to a public reference of the game (Wikipedia, Spanish
  when the article exists, otherwise English). It documents where the rules
  come from; it is not a source of copied content.
- Generic names only: no trademarks as titles ("Dibujo adivinado", not the
  commercial game).
- Safety: no challenges with physical risk, no alcohol, and nothing that
  publishes minors. "Verdad o reto" and "Yo nunca nunca" are 14+ and
  alcohol-free.

## Prices

- `FREE` (source `CURATED`, `sourceRef` = the rules reference) only when
  nothing beyond what a home already has is needed: phones, paper, a deck,
  dice, a ball. A curated free price at the Hogar does not expire (see
  `src/catalog/eligibility.ts`).
- `UNKNOWN` when it needs buying food, supplies or a subscription: movie
  night, cooking together, home spa, living-room picnic. They are plannable
  but never auto-recommended until someone sources a price.

## Batch 1 (2026-10-28)

| Batch | Content | Activities |
|---|---|---:|
| H1 | Phones and social deduction | 9 |
| H2 | Paper, pencil and words | 9 |
| H3 | Cards, dice and board games | 14 |
| H4 | Creative plans at home | 12 |
| H5 | Party and challenges | 7 |
| H6 | Outdoors (patio, plaza, park) | 8 |
| **Total** | 53 FREE with a rules source, 6 UNKNOWN | **59** |

Every activity carries at least one "who" and one "mood" occasion, people
bounds and, when it matters, a minimum age and the materials.

## Rebuild

    node catalog-data/hogar-v1/build.cjs
    pnpm catalog import catalog-data/hogar-v1/data/package.json --confirm <db>
