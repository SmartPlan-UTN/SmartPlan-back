# Community consent and public identity

Community discovers experiences shared by their authors. An experience contains
the public score, tags, moderated comment, author username/avatar and the
outing's own moderated photos. It does not expose the source itinerary.

## Publications and discovery

`GET /community/feed` returns a paginated, chronological union of public authored
plans and explicitly shared experiences. `type=all|plans|experiences` filters
the same feed; `q`, `page` and `limit` retain the existing public query limits.
Each item has a `kind` discriminator and the corresponding curated public card.
SQL selects the requested page before hydrating cards, and hydration rechecks
visibility and consent. Creator identity, inspiration and review links use
public usernames rather than legal names.

Plan publication and experience sharing are independent. Generated proposals
first become private editable copies before their owner can publish them.
Private feedback, actual spending and private source details stay private;
sharing previews show only the public score, comment, tags and own photos.

Completed request responses may include up to three `communityRecommendations`.
These are other people's currently public plans whose whole ordered itinerary
fits the resolved intent, current catalogue eligibility, travel, duration and
available price/time evidence. Unknown evidence remains explicit. Shared reviews
provide a bounded ranking signal only among eligible community plans. Reading a
request does not initiate external verification calls. A community lookup failure
does not fail the generated result, and `primaryRecommendation` remains the first
generated proposal. The frontend places these supplementary cards below the map;
without matches it renders no section.

## Existing consent

Migration `1793100000000-AddCommunityConsentVersion` adds
`feedback.community_consent_version`. It withdraws existing sharing without
deleting feedback, changing ratings or lifting moderation decisions. Authors
must share again under the new Community wording. New sharing records version 1.
The global feed, experience detail and creator experience count require this
version. Changing only the rating or comment never grants public consent.

The media reader also understands version 0 for compatibility: that older scope
permits only the own photos of outings whose source plan remains public.
Version 1 permits an author's own photos independently of publishing the source.
Copied source photos remain private. Withdrawing sharing removes public access.

## Private sources and search

Public experience responses omit legal names, email, phone, source titles and
itinerary details. Inspiration is navigable only while its referenced plan and
author are public/active. Search matches consented comments, tags and usernames;
titles, actions and locations are searchable only through a currently public
source plan. The private outing snapshot is never searched.

`q` treats `%`, `_` and backslashes as literal characters. Public Community routes
are limited to 30 requests per minute per route/IP using the existing throttler.

## Usernames

Profile updates reject `username: null`. Omitting it preserves the existing name.
System names (`admin`, `smartplan`, `soporte`, etc.) and generated
`viajero<ID>` / `viajero<ID>_<six hex digits>` names cannot be claimed by another
account. An account may retain its own generated name while editing its profile.
Registration and administrative creation allocate an alternative generated name
if a legacy account already occupies the initial choice.

Missing legacy usernames never become invented navigable aliases. Public clients
must omit creator links when no username is supplied.

## Menu contributions

Only administrators can see contributor legal identity in the moderation queue;
the contributor's own listing and public Community responses omit it. A menu
photo is limited to 8 MiB and three requests per minute per authenticated account
across target places. OCR permits one child process at a time per API/worker
process; a busy API returns 429 rather than starting another child.

## Migration history and deployment

Keep the existing migration names: earlier identifiers may already be recorded
in developer databases. `AddPlanningEngine` and `RetireOrphanRolePermissions`
share a timestamp but change independent tables; the full migration chain is
tested from an empty database. Older pending migrations are still executed by
TypeORM. Renaming an executed migration would make it pending again and can
repeat destructive or non-idempotent operations.

Run migrations against an environment with a reconciled migration history, then
deploy the matching backend and frontend in one release window. Verify profile
editing, per-stop feedback, Community privacy, place-stop plan details and native
worker readiness. A schema rollback does not automatically restore withdrawn
sharing. The consent migration is tested through up/down/up with existing data.
