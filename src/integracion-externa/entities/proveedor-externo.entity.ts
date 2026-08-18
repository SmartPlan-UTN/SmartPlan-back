import { Column, Entity, OneToMany } from 'typeorm';
import { EntidadCatalogo } from '../../common/entidades/entidad-catalogo';
import { SincronizacionExterna } from './sincronizacion-externa.entity';

/**
 * Servicio externo del que el sistema toma datos (CU48–CU52).
 *
 * Valores previstos en la `key`: `google_maps` (direcciones, coordenadas y
 * distancias) y `gemini` (armado de planes). Que sea una tabla y no una
 * constante en el código permite apagar un proveedor sin desplegar.
 *
 * **Ninguna credencial se guarda acá.** Las API keys viajan por variables de
 * entorno (`GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`); esta tabla solo dice qué
 * proveedores existen y cuál está habilitado.
 */
@Entity('proveedor_externo')
export class ProveedorExterno extends EntidadCatalogo {
  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @OneToMany(
    () => SincronizacionExterna,
    (sincronizacion) => sincronizacion.proveedor,
  )
  sincronizaciones: SincronizacionExterna[];
}
