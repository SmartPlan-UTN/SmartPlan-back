/** Copy only unexpired provider cache and quota accounting; never canonical data or photos. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const { Client } = require('pg');

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const option = key => args[args.indexOf(key) + 1];
const rehearsal = args.includes('--rehearsal');
const env = dotenv.parse(fs.readFileSync(path.join(root, rehearsal ? '.env.local' : '.env')));
const url = new URL(rehearsal ? env.DATABASE_URL : env.DATABASE_PUBLIC_URL);
if (rehearsal) {
  if (url.hostname !== 'localhost') throw Error('Rehearsal must stay local');
  url.pathname = '/smartplan_staging_rehearsal_20261014_test';
} else if (option('--allow-host') !== url.hostname || !env.FRONTEND_URL?.includes('staging')) {
  throw Error('Explicit staging host required');
}
const database = decodeURIComponent(url.pathname.slice(1));
const commit = args.includes('--confirm');
if (commit && option('--confirm') !== database) throw Error('Database confirmation mismatch');
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '.local/staging/place-cache.json')));
const bytes = fs.readFileSync(path.join(__dirname, 'data/package.json'));
if (snapshot.packageSha256 !== crypto.createHash('sha256').update(bytes).digest('hex')) throw Error('Package hash mismatch');
const month = snapshot.generatedAt.slice(0, 7);
if (month !== new Date().toISOString().slice(0, 7)) throw Error('Refresh the local snapshot for the current month');
const cacheFields = [
  ['external_rating', 'numeric'], ['external_rating_count', 'integer'],
  ['external_price_min', 'numeric'], ['external_price_max', 'numeric'],
  ['external_price_currency', 'text'], ['external_price_level', 'text'],
  ['external_latitude', 'numeric'], ['external_longitude', 'numeric'],
  ['external_business_status', 'text'], ['external_fetched_at', 'timestamptz'],
  ['external_expires_at', 'timestamptz'],
];
const permitted = new Set(['slug', 'google_place_id', ...cacheFields.map(([key]) => key)]);
if (snapshot.places.some(row => Object.keys(row).some(key => !permitted.has(key)))) throw Error('Unexpected cache field');

async function main() {
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('mendoza-cache-transfer'))");
    const result = await client.query(`WITH incoming AS (
      SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(slug text, google_place_id text,
        ${cacheFields.map(([key, type]) => `${key} ${type}`).join(', ')})
      ) UPDATE place p SET ${cacheFields.map(([key]) => `${key} = i.${key}`).join(', ')}, updated_at = now()
      FROM incoming i WHERE p.slug = i.slug AND p.google_place_id = i.google_place_id
        AND p.deleted_at IS NULL AND p.status = 'published' AND p.discoverable
        AND i.external_fetched_at <= now() AND i.external_expires_at > now()
        AND i.external_expires_at <= i.external_fetched_at + interval '30 days'
        AND (p.external_fetched_at IS NULL OR p.external_fetched_at < i.external_fetched_at)`,
    [JSON.stringify(snapshot.places)]);
    let quotaRows = 0;
    for (const usage of snapshot.monthlyUsage.filter(row => ['place-photo', 'ui-kit'].includes(row.context))) {
      if (!Number.isSafeInteger(usage.count) || usage.count < 0 || usage.count > 10000) throw Error('Invalid quota count');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [usage.context]);
      const prefix = `mendoza-local:${month}:${usage.context}:`;
      const inserted = await client.query(`INSERT INTO external_data_usage
        (id_external_provider, external_reference, context, used_at)
        SELECT p.id, $1::text || n::text, $2::text, $3::timestamptz
        FROM external_provider p CROSS JOIN generate_series(1, $4::integer) n
        WHERE p.key = 'google-maps' AND p.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM external_data_usage u
            WHERE u.external_reference = $1::text || n::text AND u.context = $2::text)`,
      [prefix, usage.context, `${month}-01T00:00:00Z`, usage.count]);
      quotaRows += inserted.rowCount;
    }
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    console.log(JSON.stringify({ target: rehearsal ? 'local-rehearsal' : 'staging', committed: commit,
      cacheRows: result.rowCount, quotaRows, originalExpiryPreserved: true, providerCalls: 0,
      canonicalCoordinatesChanged: false, photosStored: false }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}
main().catch(error => { console.error('Cache transfer failed:', error.code || error.name); process.exitCode = 1; });
