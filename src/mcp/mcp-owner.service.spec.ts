import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { McpOwnerService } from './mcp-owner.service';

describe('McpOwnerService', () => {
  const findOne = jest.fn();
  const build = (configured?: number) =>
    new McpOwnerService(
      { findOne } as unknown as Repository<User>,
      { get: () => configured } as unknown as ConfigService,
    );

  it('uses MCP_OWNER_USER_ID when it is set', async () => {
    findOne.mockResolvedValue({ id: 7 });
    await expect(build(7).resolveOwnerId()).resolves.toBe(7);
    expect(findOne).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('fails clearly when MCP_OWNER_USER_ID points nowhere', async () => {
    findOne.mockResolvedValue(null);
    await expect(build(7).resolveOwnerId()).rejects.toThrow(NotFoundException);
  });

  it('falls back to the first administrator', async () => {
    findOne.mockResolvedValue({ id: 2 });
    await expect(build().resolveOwnerId()).resolves.toBe(2);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: { key: 'admin' } },
        order: { id: 'ASC' },
      }),
    );
  });

  it('fails clearly when there is no administrator', async () => {
    findOne.mockResolvedValue(null);
    await expect(build().resolveOwnerId()).rejects.toThrow(/no administrator/);
  });
});
