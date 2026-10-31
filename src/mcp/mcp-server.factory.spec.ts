import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MediaService } from '../media/media.service';
import { McpActivitiesService } from './mcp-activities.service';
import { McpPlansService } from './mcp-plans.service';
import { McpReferenceService } from './mcp-reference.service';
import { McpServerFactory } from './mcp-server.factory';

describe('McpServerFactory', () => {
  const plans = { load: jest.fn() };
  const factory = new McpServerFactory(
    {} as McpActivitiesService,
    plans as unknown as McpPlansService,
    {} as McpReferenceService,
    {} as MediaService,
  );

  async function connect(): Promise<Client> {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await factory.create().connect(serverSide);
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(clientSide);
    return client;
  }

  it('exposes the loading tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'create_image_upload',
      'list_allowed_values',
      'publish_loaded_plans',
      'upsert_activities_bulk',
      'upsert_activity',
      'upsert_plan',
      'upsert_plans_bulk',
    ]);
    await client.close();
  });

  it('runs a bulk plan load and summarises it', async () => {
    plans.load.mockResolvedValue([{ status: 'created' }, { status: 'error' }]);
    const client = await connect();
    const result = await client.callTool({
      name: 'upsert_plans_bulk',
      arguments: { plans: [{ sourceId: 'a' }, { sourceId: 'b' }] },
    });
    const [content] = result.content as Array<{ text: string }>;
    expect(JSON.parse(content.text)).toMatchObject({
      summary: { created: 1, error: 1 },
    });
    await client.close();
  });
});
