import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServerFactory } from './mcp-server.factory';

export interface McpToolDescription {
  name: string;
  description: string | null;
  inputSchema: Record<string, unknown>;
}

/**
 * Describes the tools by asking a real server instance (`tools/list` over an
 * in-memory transport), so the list is always the one bots see.
 */
@Injectable()
export class McpToolsService {
  constructor(private readonly factory: McpServerFactory) {}

  async list(): Promise<McpToolDescription[]> {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = this.factory.create();
    await server.connect(serverSide);
    const client = new Client({ name: 'smartplan-admin', version: '1.0.0' });
    try {
      await client.connect(clientSide);
      const { tools } = await client.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? null,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    } finally {
      await client.close();
      await server.close();
    }
  }
}
