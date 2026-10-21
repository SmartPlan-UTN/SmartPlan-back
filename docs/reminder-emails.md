# Reminder emails (#127)

Two reminders reach people by email, on top of the in-app notifications:

| Reminder | Subject | Link |
| --- | --- | --- |
| Inactivity | «Hace mucho que no armás un plan» | `FRONTEND_URL/plans/create` |
| Pending feedback (CU23) | «Recordá completar la retroalimentación de tu salida» | `FRONTEND_URL/outings/<id>` |

Both links point to private screens. An anonymous visitor goes to
`/login?redirect=<route>` and comes back to the same screen after signing in.

## Rules

**Who receives them.** Only accounts that are active (`user_status = active`),
not deleted and with `user.email_reminders_enabled = true` (the default).
The inactivity reminder also requires the `user` role, so administrators never
get it. Password recovery ignores the preference.

**Inactivity.** "Building a plan" means creating any plan (authored, generated
or an outing) or asking for one to be generated (`plan_request`). The last
activity is the latest of those dates, or the sign-up date for an account that
never did either. So a new account is reminded once it has gone the whole
period without its first plan.

- Period: `REMINDER_INACTIVITY_DAYS` (default 30).
- One email per inactive period, however long it lasts: the dedupe key is
  `inactivity:<user>:<last activity>`. A second email needs new activity and a
  new inactive period.
- Frequency cap: never two inactivity emails within
  `REMINDER_INACTIVITY_MIN_INTERVAL_DAYS` (default 30).

**Feedback.** Same rule as the in-app reminder: an outing completed at least 24
hours ago with no feedback. Outings completed more than
`REMINDER_FEEDBACK_MAX_AGE_DAYS` (default 14) ago are skipped, so turning this
on never mails about old outings. One email per outing (`feedback:<plan>`).

**Stale reminders.** Each reminder is checked again right before it is sent.
It is cancelled (`cancelled_reason`) if the feedback arrived
(`feedback_completed`), a plan was created after it was queued
(`activity_resumed`), or the person opted out or was deactivated
(`recipient_not_eligible`).

## How it works

`ReminderEmailScheduler` runs every five minutes in the API process, where the
email configuration lives. Each tick:

1. **Enqueues** reminder events in the `email_reminder` outbox with
   `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING`. Concurrent ticks or
   several replicas resolve to one row per event.
2. **Claims** up to `REMINDER_EMAIL_BATCH_SIZE` (default 50) due rows with
   `FOR UPDATE SKIP LOCKED`, so two dispatchers never take the same row.
3. **Sends** each one through `EmailService.send`, using the dedupe key as the
   Resend idempotency key: a send retried after a crash is not a second email.

A dispatcher that dies mid-send leaves the row `sending`; after 10 minutes its
lock expires and the next tick reclaims it. Claims carry their attempt number:
reads and final updates only apply to that attempt, so a dispatcher that resumes
after its claim was taken cannot overwrite the new dispatcher or count a stale
result as a successful transition. Expired claims cannot start queued sends.

A database failure while recording provider acceptance leaves the row `sending`
for recovery with the same provider idempotency key. Only provider failures are
classified into retries or definitive delivery failures; persistence failures
are handled by the dispatcher recovery path. An abandoned send can replay its
idempotency key beyond the attempt limit to recover an unknown provider outcome;
a definitive provider answer still uses the configured retry limit.

`REMINDER_EMAILS_ENABLED=false` is the kill switch.

### Why an outbox and not a RabbitMQ job

Deduplication and stale checks need PostgreSQL state anyway (see
`skills/05-architecture`: idempotency belongs against PostgreSQL). Provider
outages and rate limits need retries spread over hours, not the 2–30 second
RabbitMQ retry queues, and the email configuration is only validated in the
API process.

## Delivery states

| `status` | Meaning |
| --- | --- |
| `pending` | Queued, waiting for `next_attempt_at`. |
| `sending` | Claimed by a dispatcher (`locked_until`). |
| `sent` | **Accepted by the provider**, with `provider_message_id` and `sent_at`. Not proof of reception. |
| `logged` | `EMAIL_TRANSPORT=log` wrote it to the application log. Nothing was sent. |
| `failed` | Permanent provider error (invalid recipient, unverified sender, bad key) or retries exhausted. `last_error` says why. |
| `cancelled` | No longer true when it was about to be sent. |

Retries: only transient provider answers (rate limit, quota, 5xx, network) are
retried, after 5 min, 15 min, 45 min... (×3, at most 6 h), up to
`REMINDER_EMAIL_MAX_ATTEMPTS` (default 5) attempts in total.

Three different things stay separate: the in-app notification (`notification`
table), the handoff to the provider (`sent` + `provider_message_id`), and
actual reception, which only the provider dashboard or the inbox can confirm.

## Preference

`GET /api/users/me` returns `emailRemindersEnabled`.
`PATCH /api/users/me` accepts `"emailRemindersEnabled": true | false`
(omit it to keep the current value; `null` is rejected).

## Manual verification with a real inbox

`EMAIL_TRANSPORT=log` does **not** count as evidence of reception. To verify
end to end in the integration environment:

1. Use `EMAIL_TRANSPORT=resend` with a verified sender (`EMAIL_FROM`). With the
   `onboarding@resend.dev` test sender, Resend only delivers to the account
   owner's address.
2. Create a test account with an inbox you control.
3. Inactivity: set its creation date in the past and wait for the next tick
   (or lower `REMINDER_INACTIVITY_DAYS`):
   ```sql
   UPDATE "user" SET created_at = now() - interval '40 days' WHERE email = '<test inbox>';
   ```
4. Feedback: complete an outing and move its completion date back:
   ```sql
   UPDATE plan SET completed_at = now() - interval '25 hours' WHERE id = <outing id>;
   ```
5. Check the outbox:
   ```sql
   SELECT id, kind, status, attempts, provider_message_id, last_error, sent_at
   FROM email_reminder ORDER BY id DESC;
   ```
6. Look up `provider_message_id` in the Resend dashboard (Emails) for the
   provider status, and confirm the message in the inbox or spam folder. Write
   down the date, the trigger, the message id, the provider status and where
   it arrived, without personal data.
