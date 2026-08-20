import { Entity, OneToMany } from 'typeorm';
import { CatalogEntity } from '../../common/entities/catalog-entity';
import { Feedback } from './feedback.entity';

/**
 * Status del procesamiento de una retroalimentación (CU21, CU23).
 *
 * Los atributos de esta clase quedaron cortados en la exportación del diagrama;
 * se le aplica la forma común de los catálogos (`name`, `key`, `description`).
 *
 * Valores previstos en la `key`: `pending` (la dejó el user y todavía no
 * se incorporó al model), `processed` (ya ajustó las recommendationes en CU21)
 * y `discarded`. El ajuste corre en segundo plano, así que el worker necesita
 * poder pedir "las pendientes" sin reprocesar las de siempre.
 */
@Entity('feedback_status')
export class FeedbackStatus extends CatalogEntity {
  @OneToMany(() => Feedback, (feedback) => feedback.status)
  feedbackes: Feedback[];
}
