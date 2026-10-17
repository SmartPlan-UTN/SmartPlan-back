/** Conservative registry cleanup: never invent a street number or route kilometre. */
function normalizeStreet(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\b(av|avda|gral|grl|sto|pte|dr|b|acc|lat)\.(?=\S)/gi, '$1. ')
    .replace(/\bavda\.?\s*/gi, 'Av. ')
    .replace(/\bgral\.?\s*/gi, 'Grl. ')
    .replace(/\bkm\.?\s*/gi, 'KM ')
    .replace(/\s+/g, ' ')
    .trim();
}

function streetKey(value) {
  return normalizeStreet(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/^(avenida|av\.?|calle|peatonal)\s+/, '')
    .replace(/\b(general|gral|grl)\.?\s+/g, 'grl ')
    .replace(/\b(almirante|almte)\s+/g, 'almte ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function addressCandidates(street, number) {
  const clean = normalizeStreet(street);
  const height = String(number || '').trim();
  // Route kilometres are not street heights. S/N alone is not a point.
  if (!clean || /\b(ruta|km|kilometro)\b/i.test(`${clean} ${height}`)) return [];
  const crossing = /\s(?:y|esquina)\s/i.test(clean);
  if (!/^\d{1,5}$/.test(height) && !crossing) return [];
  if (height && !/^\d{1,5}$/.test(height) && !/^s\s*\/\s*n$/i.test(height)) return [];
  const suffix = /^\d{1,5}$/.test(height) ? ` ${height}` : '';
  const bare = clean.replace(/^(?:avenida|av\.?|peatonal)\s+/i, '');
  return [...new Set([`${clean}${suffix}`, `${bare}${suffix}`, `${bare.replace(/\./g, '')}${suffix}`])];
}

/** A normalized full street name may expand a registry surname/initial. */
function sameStreet(requested, resolved) {
  const a = streetKey(requested).split(' ');
  const b = streetKey(resolved).split(' ');
  return a.length > 0 && a.every((token) => b.includes(token));
}

/** Owned editorial addresses must use their current street/height too. */
function addressParts(address) {
  const first = normalizeStreet(String(address || '').split(',')[0]);
  const match = first.match(/^(.+?)\s+(\d{1,5})$/);
  return { street: match ? match[1] : first, number: match ? match[2] : '' };
}

module.exports = { normalizeStreet, streetKey, addressCandidates, sameStreet, addressParts };
