#!/usr/bin/env node
// Builds the Mendoza v2 package (schema v2) from the reviewed v1 package plus
// the curated v2 files. Offline and deterministic: the same inputs always give
// the same bytes.
//
//   node catalog-data/mendoza-v2/build.cjs
//
// Inputs:
//   ../mendoza-v1/data/package.json   the source of truth for v1 (not release/)
//   curated/00-occasions-v1.json      occasions of the 74 v1 activities
//   curated/[1-9]*.json               new { place, activities[] } entries
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;
const v1 = JSON.parse(
  fs.readFileSync(path.join(here, '../mendoza-v1/data/package.json'), 'utf8'),
);
const tagging = JSON.parse(
  fs.readFileSync(path.join(here, 'curated/00-occasions-v1.json'), 'utf8'),
).occasions;

const sortedKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortedKeys(value[key])]),
    );
  return value;
};

const missing = v1.activities
  .filter((activity) => !tagging[activity.slug])
  .map((activity) => activity.slug);
if (missing.length) {
  console.error(`Untagged v1 activities: ${missing.join(', ')}`);
  process.exit(1);
}
const unknown = Object.keys(tagging).filter(
  (slug) => !v1.activities.some((activity) => activity.slug === slug),
);
if (unknown.length) {
  console.error(`Occasions for unknown activities: ${unknown.join(', ')}`);
  process.exit(1);
}

const places = [...v1.places];
const activities = v1.activities.map((activity) => ({
  ...activity,
  occasions: [...tagging[activity.slug]].sort(),
}));

// New curated places and activities, one file per batch.
const batchFiles = fs
  .readdirSync(path.join(here, 'curated'))
  .filter((name) => /^[1-9]\d*-.+\.json$/.test(name))
  .sort();
for (const name of batchFiles) {
  const entries = JSON.parse(
    fs.readFileSync(path.join(here, 'curated', name), 'utf8'),
  );
  for (const entry of entries) {
    if (entry.place) places.push(entry.place);
    activities.push(...entry.activities);
  }
}

const slugs = new Set();
for (const record of [...places, ...activities]) {
  if (slugs.has(record.slug)) {
    console.error(`Duplicate slug: ${record.slug}`);
    process.exit(1);
  }
  slugs.add(record.slug);
}

const pkg = {
  schemaVersion: 2,
  source: 'mendoza-v2',
  licenseClass: v1.licenseClass,
  geography: v1.geography,
  places: places.sort((a, b) => a.slug.localeCompare(b.slug)),
  activities: activities.sort((a, b) => a.slug.localeCompare(b.slug)),
};
fs.mkdirSync(path.join(here, 'data'), { recursive: true });
fs.writeFileSync(
  path.join(here, 'data/package.json'),
  `${JSON.stringify(sortedKeys(pkg), null, 2)}\n`,
);
console.log(
  `mendoza-v2: ${pkg.places.length} places, ${pkg.activities.length} activities (${batchFiles.length} new batches)`,
);
