# Ratings API

CU44-CU47 rating contract. Public ratings are visible only after approval.

| Method | Route | Access |
| --- | --- | --- |
| GET | `/api/activities/:activityId/ratings` | Public |
| GET | `/api/activities/:activityId/ratings/me` | `rating.list` |
| POST | `/api/activities/:activityId/ratings` | `rating.create` |
| PATCH | `/api/ratings/:id` | `rating.update`, author only |
| DELETE | `/api/ratings/:id` | `rating.delete`, author only |
| GET | `/api/admin/ratings` | `rating.moderate` |
| PATCH | `/api/admin/ratings/:id/moderation` | `rating.moderate` |
| DELETE | `/api/admin/ratings/:id` | `content.delete`, administrator only |

Creating a rating requires `{ "planId": 12, "score": 5, "comment": "..." }`.
The referenced plan must belong to the caller, be `completed`, and contain the
activity. A user can keep one active rating per activity.

Comments are checked against the Spanish lexical list and Gemini. Clean comments
are approved automatically; suspicious content, an unavailable lexical list, or an
unavailable classifier stays pending and is excluded from public listings and
activity averages. Editing a comment repeats moderation; editing only the score
keeps the current moderation decision. Rejected comments expose their reason only
to their author and an administrator.

An administrator can moderate a rating in any state, so an approved comment that
the automated checks missed can still be taken down and a wrongly rejected one can
be restored.

CU56 lets an administrator soft-delete a rating that violates the rules. The
optional `{ "reason" }` body is trimmed and limited to 500 characters. The audit
entry preserves the administrator actor, timestamp, affected rating, and reason.
