# Generation search radius migration

`AddGenerationSearchRadius1791817200000` adds nullable `resolved_latitude`,
`resolved_longitude` and `applied_max_distance_km` columns to `plan_request`, with
coordinate bounds, a complete-pair constraint, and a positive-radius constraint
requiring a centre.

This is additive schema only: no account data changes, no backfill, no recalculation
of historical requests, and no password changes. Existing rows remain null.
New requests checkpoint these fields with resolved intent and category relations.
The rollback drops the constraints and three columns, losing only new radius metadata.

The migration's up/down SQL is tested on the isolated local database, including
preservation of an existing request. It has not been executed on staging.
Normal deployment must apply the reviewed migration before starting the new API
or worker; both processes read the new entity columns. No deployment is part of
this ticket. Production's existing startup migration mechanism can apply it;
staging operators must verify their environment because development mode uses
TypeORM synchronization instead.
