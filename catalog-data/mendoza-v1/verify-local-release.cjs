/** Offline rebuild and optional idempotency proof against the approved local DB. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');
const root = path.resolve(__dirname, '../..');
const output = path.join(__dirname, '.local');
fs.mkdirSync(output, { recursive: true });
const packagePath = path.join(__dirname, 'data/package.json');
const cli = path.join(root, 'src/catalog/cli/catalog.cli.ts');
const tsNode = path.join(root, 'node_modules/ts-node/dist/bin.js');
function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, {
    cwd: root, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
function build() {
  run([path.join(__dirname, 'build.cjs')], { ...process.env, FETCH: '0' });
  run([tsNode, cli, 'csv-to-package', path.join(__dirname, 'data/places.csv'),
    path.join(__dirname, 'data/activities.csv'), packagePath, '--source', 'mendoza-v1']);
  return fs.readFileSync(packagePath);
}
const first = build();
const second = build();
if (!first.equals(second)) throw new Error('Offline rebuild is not byte-identical');
const pkg = JSON.parse(second);
const prohibited = /^(?:externalRating|externalPrice|googleRating|googleRatingCount|googleLatitude|googleLongitude|googlePriceLevel|googlePriceRange|photoName|photoReference|photoUri|authorAttributions|cachedAt|expiresAt)$/i;
function scan(value, location = '$') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (prohibited.test(key)) throw new Error(`Restricted field ${location}.${key}`);
    scan(child, `${location}.${key}`);
  }
}
scan(pkg);
const places = new Map(pkg.places.map((p) => [p.slug, p]));
const googleIds = pkg.places.map((p) => p.googlePlaceId).filter(Boolean);
if (new Set(googleIds).size !== googleIds.length) throw new Error('Different canonical places share a Google identity; review required');
if (places.size !== pkg.places.length) throw new Error('Duplicate place slugs');
if (new Set(pkg.activities.map((a) => a.slug)).size !== pkg.activities.length) throw new Error('Duplicate activity slugs');
for (const p of pkg.places) {
  if (p.latitude != null && !p.coordinatesRef) throw new Error(`Point without provenance: ${p.slug}`);
}
for (const a of pkg.activities) {
  if (a.places.some((slug) => !places.has(slug))) throw new Error(`Missing place: ${a.slug}`);
}
const manifest = {
  generatedAt: new Date().toISOString(),
  packageSha256: crypto.createHash('sha256').update(second).digest('hex'),
  packageBytes: second.length,
  offlineRebuildIdentical: true,
  restrictedFieldScan: 'passed',
  places: pkg.places.length,
  placesWithPersistentCoordinates: pkg.places.filter((p) => p.latitude != null && p.longitude != null).length,
  activities: pkg.activities.length,
  activitiesWithKnownPrice: pkg.activities.filter((a) => a.price.kind !== 'UNKNOWN').length,
  openLicensedImages: pkg.places.filter((p) => p.image).length,
};
if (process.argv.includes('--import-local')) {
  const local = dotenv.parse(fs.readFileSync(path.join(root, '.env.local')));
  const target = new URL(local.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.pathname !== '/smartplan_mendoza') {
    throw new Error('Import proof requires localhost/smartplan_mendoza');
  }
  const env = { ...process.env, ...local, NODE_ENV: 'development' };
  const args = [tsNode, cli, 'import', packagePath, '--confirm', 'smartplan_mendoza',
    '--archive-missing', '--allow-mass-archive', '--accept-duplicates'];
  run(args, env);
  const proof = run(args, env);
  fs.writeFileSync(path.join(output, 'idempotency-proof.log'), proof);
  const start = proof.indexOf('{\n  "batchId"');
  const end = proof.lastIndexOf('}');
  const report = JSON.parse(proof.slice(start, end + 1));
  if (Object.entries(report.stats).some(([key, value]) => !key.endsWith('.unchanged') && value !== 0)) {
    throw new Error('Second import changed canonical data');
  }
  if (report.stats['places.unchanged'] !== pkg.places.length || report.stats['activities.unchanged'] !== pkg.activities.length) {
    throw new Error('Second import did not retain every canonical record unchanged');
  }
  manifest.secondImportStats = report.stats;
}
fs.writeFileSync(path.join(output, 'release-verification.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
