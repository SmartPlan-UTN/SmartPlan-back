import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { CreatedMcpKeyResponseDto, McpKeyResponseDto } from './dto/mcp-key.dto';
import { McpKey } from './entities/mcp-key.entity';

/** Every key starts with this marker so a leaked one is easy to recognise. */
export const MCP_KEY_MARKER = 'smp_mcp_';
const PREFIX_LENGTH = MCP_KEY_MARKER.length + 4;

export function hashMcpKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

@Injectable()
export class McpKeysService {
  constructor(
    @InjectRepository(McpKey)
    private readonly keys: Repository<McpKey>,
  ) {}

  async generate(name: string): Promise<CreatedMcpKeyResponseDto> {
    const key = `${MCP_KEY_MARKER}${randomBytes(32).toString('base64url')}`;
    const saved = await this.keys.save(
      this.keys.create({
        name,
        keyHash: hashMcpKey(key),
        prefix: key.slice(0, PREFIX_LENGTH),
        active: true,
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    return { ...this.toResponse(saved), key };
  }

  async list(): Promise<McpKeyResponseDto[]> {
    const keys = await this.keys.find({ order: { id: 'ASC' } });
    return keys.map((key) => this.toResponse(key));
  }

  async revoke(id: number): Promise<void> {
    const key = await this.keys.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException({
        code: 'MCP_KEY_NOT_FOUND',
        message: 'The requested MCP key does not exist',
      });
    }
    if (!key.active) return;
    key.active = false;
    key.revokedAt = new Date();
    await this.keys.save(key);
  }

  /**
   * Returns the active key matching `rawKey` and records its use, or `null`.
   * The lookup is by hash, so the raw key is never compared or stored.
   */
  async authenticate(rawKey: string): Promise<McpKey | null> {
    if (!rawKey.startsWith(MCP_KEY_MARKER)) return null;
    const key = await this.keys.findOne({
      where: { keyHash: hashMcpKey(rawKey), active: true },
    });
    if (!key) return null;
    const lastUsedAt = new Date();
    await this.keys.update(key.id, { lastUsedAt });
    key.lastUsedAt = lastUsedAt;
    return key;
  }

  private toResponse(key: McpKey): McpKeyResponseDto {
    return {
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      active: key.active,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    };
  }
}
