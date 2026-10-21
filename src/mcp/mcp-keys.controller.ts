import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import {
  CreatedMcpKeyResponseDto,
  CreateMcpKeyDto,
  McpKeyResponseDto,
} from './dto/mcp-key.dto';
import { McpKeysService } from './mcp-keys.service';

@Roles('admin')
@ApiController({ tag: 'MCP keys', authenticated: true })
@Controller('admin/mcp-keys')
export class McpKeysController {
  constructor(private readonly keys: McpKeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Generate an MCP API key (shown only in this response)',
  })
  @ApiCreatedResponse({ type: CreatedMcpKeyResponseDto })
  create(@Body() dto: CreateMcpKeyDto): Promise<CreatedMcpKeyResponseDto> {
    return this.keys.generate(dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'List MCP API keys (without the keys)' })
  @ApiOkResponse({ type: McpKeyResponseDto, isArray: true })
  list(): Promise<McpKeyResponseDto[]> {
    return this.keys.list();
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke an MCP API key' })
  @ApiNoContentResponse()
  revoke(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.keys.revoke(id);
  }
}
