import { Check, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

/** Shared persisted metadata for an object stored in the private S3 bucket. */
@Check('"byte_size" > 0')
@Check('"width" > 0')
@Check('"height" > 0')
export abstract class ImageEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'object_key', type: 'varchar', length: 500 })
  objectKey: string;

  @Column({ name: 'content_type', type: 'varchar', length: 100 })
  contentType: string;

  @Column({ name: 'byte_size', type: 'integer' })
  byteSize: number;

  @Column({ type: 'integer' })
  width: number;

  @Column({ type: 'integer' })
  height: number;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;
}
