/**
 * Harvests Google Place IDs (the only provider value we may keep) and the
 * "drop" decisions from a reviewed match run, into versioned files, so the
 * package can be rebuilt without calling Google again.
 *
 *   node harvest.cjs <package.json> <applied-package.json> <matches.json>
 */
const fs = require('fs');
const [pkgPath, appliedPath, matchesPath] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const applied = JSON.parse(fs.readFileSync(appliedPath, 'utf8'));
const matches = JSON.parse(fs.readFileSync(matchesPath, 'utf8'));
const reviewPath = 'curated/google-review.json';
const review = fs.existsSync(reviewPath)
  ? JSON.parse(fs.readFileSync(reviewPath, 'utf8'))
  : { accept: {}, drop: {} };
const idsPath = 'curated/google-place-ids.json';
const droppedPath = 'curated/dropped-places.json';
const ids = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, 'utf8')) : {};
const dropped = fs.existsSync(droppedPath) ? JSON.parse(fs.readFileSync(droppedPath, 'utf8')) : {};

const kept = new Set(applied.places.map((p) => p.slug));
for (const p of pkg.places) {
  const m = matches[p.slug];
  if (!m) continue;
  const appliedPlace = applied.places.find((x) => x.slug === p.slug);
  if (appliedPlace && appliedPlace.googlePlaceId) ids[p.slug] = appliedPlace.googlePlaceId;
  else if (!kept.has(p.slug)) dropped[p.slug] = `google:${m.decision.status.toLowerCase()}`;
}
// Operators from the 2018 adventure registry are published only when Google
// shows a living listing (and, when known, a real review history).
for (const p of pkg.places) {
  if (!String(p.sourceRef || '').includes('prestadores-de-turismo-aventura')) continue;
  const id = ids[p.slug];
  if (!id) continue;
  const m = matches[p.slug];
  const c = m && m.candidates.find((x) => x.placeId === id);
  // Identity-only (Pro) matches carry no review count: an operating listing is
  // then enough; a known review count still has to show a real history.
  const fewReviews = c && c.ratingCount !== null && c.ratingCount !== undefined && c.ratingCount < 10;
  if (!c || fewReviews || c.businessStatus === 'CLOSED_PERMANENTLY') {
    delete ids[p.slug];
    dropped[p.slug] = 'adventure:low_signal';
  }
}
// manual review: accept a named candidate, or drop
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
for (const [slug, candidateName] of Object.entries(review.accept || {})) {
  const m = matches[slug];
  if (!m) { console.warn('no match row for', slug); continue; }
  const c = m.candidates.find((x) => norm(x.name) === norm(candidateName));
  if (!c) { console.warn('candidate not found', slug, candidateName); continue; }
  ids[slug] = c.placeId;
  delete dropped[slug];
}
for (const [slug, reason] of Object.entries(review.drop || {})) {
  dropped[slug] = `review:${reason}`;
  delete ids[slug];
}
fs.writeFileSync(idsPath, JSON.stringify(ids, null, 2) + '\n');
fs.writeFileSync(droppedPath, JSON.stringify(dropped, null, 2) + '\n');
console.log(`ids=${Object.keys(ids).length} dropped=${Object.keys(dropped).length}`);
