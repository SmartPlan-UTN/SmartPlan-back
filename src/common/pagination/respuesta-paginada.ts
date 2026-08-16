export interface MetadatosPaginacion {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

export interface RespuestaPaginada<T> {
  datos: T[];
  paginacion: MetadatosPaginacion;
}

export function crearRespuestaPaginada<T>(
  datos: T[],
  total: number,
  pagina: number,
  limite: number,
): RespuestaPaginada<T> {
  return {
    datos,
    paginacion: {
      pagina,
      limite,
      total,
      totalPaginas: Math.ceil(total / limite),
    },
  };
}
