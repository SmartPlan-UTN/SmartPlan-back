/** Read-only local preparation. No remote connection or provider request. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { Client } = require('pg');
const root = path.resolve(__dirname, '../..');
const env = dotenv.parse(fs.readFileSync(path.join(root, '.env.local')));
const target = new URL(env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.pathname !== '/smartplan_mendoza') throw Error('Source must be the approved local database');

async function main() {
  const packageBytes = fs.readFileSync(path.join(__dirname, 'data/package.json'));
  const pkg = JSON.parse(packageBytes);
  const identities = new Map(pkg.places.map(place => [place.slug, place.googlePlaceId]));
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: false });
  await client.connect();
  try {
    const rows = (await client.query(`SELECT slug, google_place_id, external_rating, external_rating_count,
      external_price_min, external_price_max, external_price_currency, external_price_level,
      external_latitude, external_longitude, external_business_status, external_fetched_at, external_expires_at
      FROM place WHERE deleted_at IS NULL AND status = 'published' AND discoverable = true
      AND google_place_id IS NOT NULL AND external_fetched_at <= now() AND external_expires_at > now()
      AND external_expires_at <= external_fetched_at + interval '30 days' ORDER BY slug`)).rows
      .filter(row => identities.get(row.slug) === row.google_place_id);
    const usage = (await client.query(`SELECT context, count(*)::int AS count FROM external_data_usage
      WHERE used_at >= date_trunc('month', now()) GROUP BY context ORDER BY context`)).rows;
    const snapshot = { format: 'smartplan-temporary-place-cache-v1', generatedAt: new Date().toISOString(),
      packageSha256: crypto.createHash('sha256').update(packageBytes).digest('hex'),
      preserveOriginalExpiry: true, containsPhotos: false, containsCredentials: false,
      monthlyUsage: usage, places: rows };
    const output = path.join(__dirname, '.local/staging');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'place-cache.json'), JSON.stringify(snapshot, null, 2) + '\n');
    fs.copyFileSync(path.join(__dirname, 'data/package.json'), path.join(output, 'package.json'));
    console.log(JSON.stringify({ packageSha256: snapshot.packageSha256, temporaryCacheRows: rows.length,
      originalExpiryPreserved: true, remoteConnections: 0, output: '.local/staging' }, null, 2));
  } finally { await client.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
