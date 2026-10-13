# Ratings API

CU44-CU47 rating contract. Ratings are public as soon as they are created;
report-based moderation (SmartPlan-front#156) is described in
[administration-api.md](administration-api.md#reported-content--pan-20--156).

| Method | Route | Access |
| --- | --- | --- |
| GET | `/api/activities/:activityId/ratings` | Public; an optional session marks `isOwn` |
| GET | `/api/activities/:activityId/ratings/me` | `rating.list` |
| POST | `/api/activities/:activityId/ratings` | `rating.create` |
| PATCH | `/api/ratings/:id` | `rating.update`, author only |
| DELETE | `/api/ratings/:id` | `rating.delete`, author only |
| DELETE | `/api/admin/ratings/:id` | `content.delete`, administrator only |

Creating a rating requires `{ "planId": 12, "score": 5, "comment": "..." }`.
The referenced plan must belong to the caller, be `completed`, and contain the
activity. A user can keep one active rating per activity.

There is no automatic moderation: a rating's `status` starts as `published`. A
user's report makes it `under_review`, which hides it, its images and its score
from everyone but its author and administrators; an administrator then keeps it
(`kept`) or removes it (`removed`). Averages and counts only include `published`
and `kept` ratings — `publicContentSql` in `src/common/moderation/content-status.ts`
is the single place that rule lives.

The public listing includes the viewer's own rating while it is under review, so
its author sees nothing change. `OwnRatingDto.removed` is the only moderation
trace its author sees. Editing the comment of a `kept` rating makes it
`published` again; an edit never lifts a review or a removal. Open reports
remain actionable after that edit: an administrator can still keep or remove
the rating, and removing it notifies its author.

CU56 lets an administrator soft-delete a rating that violates the rules. The
optional `{ "reason" }` body is trimmed and limited to 500 characters. The audit
entry preserves the administrator actor, timestamp, affected rating, and reason.
