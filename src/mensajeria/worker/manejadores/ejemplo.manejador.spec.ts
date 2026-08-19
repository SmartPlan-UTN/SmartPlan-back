import { Test, TestingModule } from '@nestjs/testing';
import { ConsumeMessage } from 'amqplib';
import { EjemploManejador } from './ejemplo.manejador';
import { ProcesadorTrabajosService } from '../procesador-trabajos.service';
import { SobreTrabajo } from '../../tipos/sobre-trabajo';
import { PayloadEjemplo, TipoTrabajo } from '../../tipos/tipo-trabajo';

function crearSobre(payload: PayloadEjemplo): SobreTrabajo<PayloadEjemplo> {
  return {
    schemaVersion: 1,
    id: 'trabajo-1',
    tipo: TipoTrabajo.EjemploEjecutar,
    createdAt: new Date().toISOString(),
    payload,
  };
}

const mensajeDePrueba = {} as ConsumeMessage;

describe('EjemploManejador', () => {
  let manejador: EjemploManejador;
  let procesador: jest.Mocked<Pick<ProcesadorTrabajosService, 'procesar'>>;

  beforeEach(async () => {
    procesador = {
      procesar: jest.fn((_sobre, _msg, ejecutar) => ejecutar(_sobre)),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        EjemploManejador,
        { provide: ProcesadorTrabajosService, useValue: procesador },
      ],
    }).compile();

    manejador = modulo.get(EjemploManejador);
  });

  it('delega el procesamiento en ProcesadorTrabajosService', async () => {
    const sobre = crearSobre({ mensaje: 'hola' });

    await manejador.manejar(sobre, mensajeDePrueba);

    expect(procesador.procesar).toHaveBeenCalledWith(
      sobre,
      mensajeDePrueba,
      expect.any(Function),
    );
  });

  it('no falla con un payload normal', async () => {
    const sobre = crearSobre({ mensaje: 'hola' });

    await expect(
      manejador.manejar(sobre, mensajeDePrueba),
    ).resolves.toBeUndefined();
  });

  it('lanza ErrorTrabajoReintentable con el marcador de falla simulada reintentable', async () => {
    const sobre = crearSobre({
      mensaje: 'hola',
      fallaSimulada: 'reintentable',
    });

    await expect(manejador.manejar(sobre, mensajeDePrueba)).rejects.toThrow(
      'Falla simulada reintentable',
    );
  });

  it('lanza ErrorTrabajoPermanente con el marcador de falla simulada permanente', async () => {
    const sobre = crearSobre({
      mensaje: 'hola',
      fallaSimulada: 'permanente',
    });

    await expect(manejador.manejar(sobre, mensajeDePrueba)).rejects.toThrow(
      'Falla simulada permanente',
    );
  });
});
