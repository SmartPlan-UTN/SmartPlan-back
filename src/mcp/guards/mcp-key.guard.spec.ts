import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { McpKey } from '../entities/mcp-key.entity';
import { McpKeysService } from '../mcp-keys.service';
import { McpKeyGuard, McpRequest } from './mcp-key.guard';

function contextFor(headers: Record<string, string>): {
  context: ExecutionContext;
  request: McpRequest;
} {
  const request = { headers } as unknown as McpRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('McpKeyGuard', () => {
  const authenticate = jest.fn();
  const guard = new McpKeyGuard({ authenticate } as unknown as McpKeysService);

  it('rejects a request without a key', async () => {
    const { context } = contextFor({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rejects an invalid or revoked key', async () => {
    authenticate.mockResolvedValue(null);
    const { context } = contextFor({ 'x-mcp-key': 'smp_mcp_bad' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts an active key from X-MCP-Key and attaches it', async () => {
    const key = { id: 1 } as McpKey;
    authenticate.mockResolvedValue(key);
    const { context, request } = contextFor({ 'x-mcp-key': 'smp_mcp_ok' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('smp_mcp_ok');
    expect(request.mcpKey).toBe(key);
  });

  it('accepts the key as a Bearer token', async () => {
    authenticate.mockResolvedValue({ id: 1 } as McpKey);
    const { context } = contextFor({ authorization: 'Bearer smp_mcp_ok' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('smp_mcp_ok');
  });
});
