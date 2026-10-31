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
  a music app. A curated free price at the Hogar does not expire (see
  `src/catalog/eligibility.ts`).
- `UNKNOWN` when it needs buying a game, food, supplies or a subscription:
  dominoes, a jigsaw, board games, movie night, cooking together, home spa,
  living-room picnic. The description says what has to be bought. They are
  plannable but never auto-recommended until someone sources a price.

## Only inside a home

Every activity happens inside a home: nothing needs a patio, a plaza, grass
or going anywhere. `build.cjs` refuses an `outdoor` occasion or words such
as plaza, parque, pasto, vereda or patio. Each activity says how to play,
its materials, people bounds and duration.

## Batches

| Batch | Content | Activities |
|---|---|---:|
| H1 | The group game night: phones, papelitos and talking | 17 |
| H2 | Paper, pencil and words | 8 |
| H3 | Cards and dice | 9 |
| H4 | Board games (need a board, a set or an app) | 5 |
| H5 | Creative plans at home | 12 |
| H6 | Party and challenges | 8 |
| **Total** | 52 FREE with a rules source, 7 UNKNOWN | **59** |

Batch 1 (2026-10-28) had an outdoor group (frisbee in the plaza, dodgeball,
hopscotch, tag, jump rope, marbles, sack race, outdoor treasure hunt) that a
plan "at home" could offer at night. It was removed on 2026-10-31 and
archived with `--archive-missing`; the group game night (impostor, charades,
guess the character, drawn telephone, group trivia, "who is most likely",
two truths and a lie, name that tune, word spies, liar) was added in its
place, aimed at an Argentine friends' get-together.

Every activity carries at least one "who" and one "mood" occasion, people
bounds and, when it matters, a minimum age and the materials.

## Rebuild

    node catalog-data/hogar-v1/build.cjs
    pnpm catalog import catalog-data/hogar-v1/data/package.json --archive-missing --confirm <db>
