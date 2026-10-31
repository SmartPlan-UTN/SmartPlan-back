import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GeorefClient } from './georef';

describe('Georef evidence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a different street even when department and height match', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        direcciones: [
          {
            calle: { nombre: 'OTHER STREET' },
            departamento: { nombre: 'Capital' },
            altura: { valor: 295 },
            ubicacion: { lat: -32.89, lon: -68.85 },
          },
        ],
      }),
    );
    await expect(
      new GeorefClient(null).geocode(
        'Aristides Villanueva',
        '295',
        'Ciudad de Mendoza',
      ),
    ).resolves.toBeNull();
  });

  it('retries old negative cache entries and retains official provenance', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'smartplan-georef-'));
    try {
      const file = join(directory, 'cache.json');
      writeFileSync(
        file,
        JSON.stringify({ 'dir|aristides villanueva 295|Capital': null }),
      );
      const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json({
          direcciones: [
            {
              calle: { nombre: 'ARISTIDES VILLANUEVA' },
              nomenclatura: 'ARISTIDES VILLANUEVA 295, Capital, Mendoza',
              departamento: { nombre: 'Capital' },
              altura: { valor: 295 },
              ubicacion: { lat: -32.89, lon: -68.85 },
            },
          ],
        }),
      );
      const point = await new GeorefClient(file).geocode(
        'Aristides Villanueva',
        '295',
        'Ciudad de Mendoza',
      );
      expect(point).toMatchObject({
        latitude: -32.89,
        longitude: -68.85,
      });
      expect(point?.ref).toContain('apis.datos.gob.ar');
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
