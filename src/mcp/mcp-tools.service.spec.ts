import { MediaService } from '../media/media.service';
import { McpActivitiesService } from './mcp-activities.service';
import { McpPlansService } from './mcp-plans.service';
import { McpReferenceService } from './mcp-reference.service';
import { McpServerFactory } from './mcp-server.factory';
import { McpToolsService } from './mcp-tools.service';

describe('McpToolsService', () => {
  it('describes the real tools with JSON Schema parameters', async () => {
    const service = new McpToolsService(
      new McpServerFactory(
        {} as McpActivitiesService,
        {} as McpPlansService,
        {} as McpReferenceService,
        {} as MediaService,
      ),
    );
    const tools = await service.list();
    const plan = tools.find((tool) => tool.name === 'upsert_plan');
    expect(tools).toHaveLength(6);
    expect(plan?.inputSchema).toMatchObject({
      type: 'object',
      required: ['plan'],
    });
  });
});
