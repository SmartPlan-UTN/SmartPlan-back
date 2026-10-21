const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStreet, streetKey, addressCandidates, addressParts } = require('./normalize-address.cjs');

test('extracts the current editorial address without mistaking numbered street names for heights', () => {
  assert.deepEqual(addressParts('San Martín 6371, Luján de Cuyo'), { street: 'San Martín', number: '6371' });
  assert.deepEqual(addressParts('25 de Mayo 817, Mendoza'), { street: '25 de Mayo', number: '817' });
  assert.deepEqual(addressParts('25 de Mayo'), { street: '25 de Mayo', number: '' });
  const route = addressParts('Ruta 82 KM 39, Cacheuta');
  assert.deepEqual(addressCandidates(route.street, route.number), []);
});

test('cleans glued registry abbreviations without changing the address height', () => {
  assert.equal(normalizeStreet('Av.juan B.justo'), 'Av. juan B. justo');
  assert.deepEqual(addressCandidates('Av.aristides Villanueva', '295'), ['Av. aristides Villanueva 295', 'aristides Villanueva 295']);
  assert.equal(streetKey('Av. Arístides Villanueva'), streetKey('ARISTIDES VILLANUEVA'));
});
test('allows explicit intersections but refuses route kilometres and unlocated S/N', () => {
  assert.deepEqual(addressCandidates('Gral. Paz y Granaderos', 'S/N'), ['Grl. Paz y Granaderos', 'Grl Paz y Granaderos']);
  for (const [street, height] of [['Ruta 173', 'KM.25'], ['Ruta Nacional 7', '53'], ['Los Andes', 'S/N'], ['Mitre', ''], ['Mitre', '123 hotel']]) {
    assert.deepEqual(addressCandidates(street, height), []);
  }
});
