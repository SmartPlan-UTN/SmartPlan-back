import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { McpKey } from './entities/mcp-key.entity';
import { hashMcpKey, MCP_KEY_MARKER, McpKeysService } from './mcp-keys.service';

describe('McpKeysService', () => {
  let repository: jest.Mocked<
    Pick<Repository<McpKey>, 'create' | 'save' | 'find' | 'findOne' | 'update'>
  >;
  let service: McpKeysService;

  beforeEach(() => {
    repository = {
      create: jest.fn((value) => value as McpKey),
      save: jest.fn((value) =>
        Promise.resolve({ id: 1, createdAt: new Date(), ...value } as McpKey),
      ),
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    service = new McpKeysService(repository as unknown as Repository<McpKey>);
  });

  it('returns the key once and stores only its hash', async () => {
    const created = await service.generate('Grok bot');
    expect(created.key.startsWith(MCP_KEY_MARKER)).toBe(true);
    const stored = repository.save.mock.calls[0][0] as McpKey;
    expect(stored.keyHash).toBe(hashMcpKey(created.key));
    expect(JSON.stringify(stored)).not.toContain(created.key);
    expect(created).not.toHaveProperty('keyHash');
  });

  it('lists keys without the hash', async () => {
    repository.find.mockResolvedValue([
      { id: 1, name: 'a', keyHash: 'secret', prefix: 'smp_mcp_ab' } as McpKey,
    ]);
    const [key] = await service.list();
    expect(key).not.toHaveProperty('keyHash');
    expect(key.prefix).toBe('smp_mcp_ab');
  });

  it('revokes an active key', async () => {
    const key = { id: 2, active: true } as McpKey;
    repository.findOne.mockResolvedValue(key);
    await service.revoke(2);
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        revokedAt: expect.any(Date) as Date,
      }),
    );
  });

  it('throws NotFoundException when revoking a missing key', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.revoke(9)).rejects.toThrow(NotFoundException);
  });

  it('authenticates an active key by hash and records its use', async () => {
    repository.findOne.mockResolvedValue({ id: 3, active: true } as McpKey);
    const raw = `${MCP_KEY_MARKER}abc`;
    await expect(service.authenticate(raw)).resolves.toMatchObject({ id: 3 });
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { keyHash: hashMcpKey(raw), active: true },
    });
    expect(repository.update).toHaveBeenCalledWith(3, {
      lastUsedAt: expect.any(Date) as Date,
    });
  });

  it('rejects a key without the marker without querying', async () => {
    await expect(service.authenticate('other')).resolves.toBeNull();
    expect(repository.findOne).not.toHaveBeenCalled();
  });
});
