import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { McpKey } from '../entities/mcp-key.entity';
import { McpKeysService } from '../mcp-keys.service';

export const MCP_KEY_HEADER = 'x-mcp-key';

export interface McpRequest extends Request {
  mcpKey?: McpKey;
}

/** Reads the key from `X-MCP-Key` or, failing that, `Authorization: Bearer`. */
export function extractMcpKey(request: Request): string | null {
  const header = request.headers[MCP_KEY_HEADER];
  const direct = Array.isArray(header) ? header[0] : header;
  if (direct?.trim()) return direct.trim();
  const [type, token] = request.headers.authorization?.split(' ') ?? [];
  if (type === 'Bearer' && token?.trim()) return token.trim();
  return null;
}

/**
 * Protects the MCP endpoint. It replaces the user JWT (the route is
 * `@Public()`): a request needs an active key from `mcp_key`.
 */
@Injectable()
export class McpKeyGuard implements CanActivate {
  constructor(private readonly keys: McpKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<McpRequest>();
    const raw = extractMcpKey(request);
    if (!raw) {
      throw new UnauthorizedException({
        code: 'MCP_KEY_REQUIRED',
        message: 'An MCP API key is required',
      });
    }
    const key = await this.keys.authenticate(raw);
    if (!key) {
      throw new UnauthorizedException({
        code: 'MCP_KEY_INVALID',
        message: 'The MCP API key is invalid or revoked',
      });
    }
    request.mcpKey = key;
    return true;
  }
}
