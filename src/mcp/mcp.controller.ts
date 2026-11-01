import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { McpKeyGuard } from './guards/mcp-key.guard';
import { McpServerFactory } from './mcp-server.factory';

/**
 * MCP endpoint (Streamable HTTP, stateless). `@Public()` only skips the user
 * JWT: `McpKeyGuard` requires an active MCP API key instead. The JSON-RPC
 * body is validated by the MCP SDK and each tool's zod schema.
 */
@ApiExcludeController()
@Public()
@UseGuards(McpKeyGuard)
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly factory: McpServerFactory) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const server = this.factory.create();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  }

  @Get()
  @HttpCode(405)
  getNotAllowed(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  @Delete()
  @HttpCode(405)
  deleteNotAllowed(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  private methodNotAllowed(res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed (stateless server)' },
      id: null,
    });
  }
}
