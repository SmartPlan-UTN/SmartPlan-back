import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { McpToolsService, type McpToolDescription } from './mcp-tools.service';

@Roles('admin')
@ApiController({ tag: 'MCP keys', authenticated: true })
@Controller('admin/mcp-tools')
export class McpToolsController {
  constructor(private readonly tools: McpToolsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the MCP tools with their JSON Schema parameters',
  })
  @ApiOkResponse({
    description: '`[{ name, description, inputSchema }]` (JSON Schema)',
  })
  list(): Promise<McpToolDescription[]> {
    return this.tools.list();
  }
}
