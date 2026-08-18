import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConsultaPaginadaDto, DireccionOrden } from './consulta-paginada.dto';
import { crearRespuestaPaginada } from './respuesta-paginada';

describe('Paginación', () => {
  it('aplica los valores predeterminados', async () => {
    const consulta = plainToInstance(ConsultaPaginadaDto, {});

    await expect(validate(consulta)).resolves.toHaveLength(0);
    expect(consulta).toMatchObject({
      pagina: 1,
      limite: 20,
      direccion: DireccionOrden.ASC,
    });
  });

  it('transforma y valida los parámetros de query', async () => {
    const consulta = plainToInstance(ConsultaPaginadaDto, {
      pagina: '2',
      limite: '50',
      ordenarPor: 'nombre',
      direccion: 'desc',
    });

    await expect(validate(consulta)).resolves.toHaveLength(0);
    expect(consulta).toEqual({
      pagina: 2,
      limite: 50,
      ordenarPor: 'nombre',
      direccion: DireccionOrden.DESC,
    });
  });

  it('rechaza páginas, límites y direcciones fuera de la convención', async () => {
    const consulta = plainToInstance(ConsultaPaginadaDto, {
      pagina: '0',
      limite: '101',
      direccion: 'lateral',
    });

    await expect(validate(consulta)).resolves.toHaveLength(3);
  });

  it('crea la respuesta con metadatos y calcula el total de páginas', () => {
    expect(crearRespuestaPaginada(['plan 21'], 21, 3, 10)).toEqual({
      datos: ['plan 21'],
      paginacion: {
        pagina: 3,
        limite: 10,
        total: 21,
        totalPaginas: 3,
      },
    });
  });
});
