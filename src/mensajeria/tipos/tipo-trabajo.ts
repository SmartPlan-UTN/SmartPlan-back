/**
 * Tipos de trabajo publicables. El valor del enum **es** la routing key —
 * deliberado: un mapa tipo→routing-key separado sería una tabla de
 * traducción que se puede desincronizar. Si algún tipo futuro necesitara una
 * routing key distinta de su nombre, ahí se introduce el mapa; hoy no.
 */
export enum TipoTrabajo {
  EjemploEjecutar = 'example.execute',
}

export interface PayloadEjemplo {
  mensaje: string;
  /**
   * Marcador de prueba. Solo lo reconoce `EjemploManejador`; ningún trabajo
   * real va a tener este campo.
   */
  fallaSimulada?: 'reintentable' | 'permanente';
}
