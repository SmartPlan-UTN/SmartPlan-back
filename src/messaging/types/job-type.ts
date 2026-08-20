/**
 * Tipos de job publicables. El value del enum **es** la routing key —
 * deliberado: un mapa type→routing-key separado sería una table de
 * traducción que se puede desincronizar. Si algún type futuro necesitara una
 * routing key distinta de su name, ahí se introduce el mapa; hoy no.
 */
export enum JobType {
  ExecuteExample = 'example.execute',
}

export interface ExamplePayload {
  message: string;
  /**
   * Marcador de prueba. Solo lo reconoce `ExampleHandler`; ningún job
   * real va a tener este field.
   */
  fallaSimulada?: 'reintentable' | 'permanente';
}
