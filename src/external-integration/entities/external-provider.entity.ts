import { Column, Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { ExternalSync } from './external-sync.entity';

/**
 * Servicio externo del que el sistema toma data (CU48–CU52).
 *
 * Valores previstos en la `key`: `google_maps` (addresses, coordinates y
 * distancias) y `gemini` (armado de plans). Que sea una table y no una
 * constante en el código permite apagar un provider sin desplegar.
 *
 * **Ninguna credencial se guarda acá.** Las API keys viajan por variables de
 * environment (`GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`); esta table solo dice qué
 * proveedores existen y cuál está habilitado.
 */
@Entity('external_provider')
export class ExternalProvider extends CatalogEntity {
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @OneToMany(() => ExternalSync, (sincronizacion) => sincronizacion.provider)
  syncs: ExternalSync[];
}
