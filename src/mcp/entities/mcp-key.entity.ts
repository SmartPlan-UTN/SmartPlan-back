import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base-entity';

/**
 * API key an external bot uses to call the MCP server (`/api/mcp`).
 *
 * The key itself is shown once, when an administrator generates it, and is
 * never stored: only its SHA-256 hash. The keys are 256-bit random values, so
 * a fast hash is enough (no dictionary to brute-force) and allows an indexed
 * lookup. `prefix` is the first characters of the key, kept so an
 * administrator can tell keys apart without exposing them.
 */
@Entity('mcp_key')
export class McpKey extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Index('IDX_mcp_key_hash', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ name: 'key_hash', type: 'char', length: 64 })
  keyHash: string;

  @Column({ type: 'varchar', length: 16 })
  prefix: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
