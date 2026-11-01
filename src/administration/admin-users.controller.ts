import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { AdminUsersService } from './admin-users.service';
import { ExportAdminUsersQueryDto } from './dto/admin-users-report.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { MetricsQueryDto } from './dto/metrics-query.dto';

@Roles('admin')
@ApiController({ tag: 'Administration', authenticated: true })
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Permissions('user.list')
  @Get('metrics')
  @ApiOperation({ summary: 'Users header metrics for a range (REP-02)' })
  metrics(@Query() query: MetricsQueryDto) {
    return this.adminUsers.metrics(query);
  }

  @Permissions('user.list')
  @Get('export')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Download the users report as PDF or CSV (REP-02)' })
  @ApiProduces('application/pdf', 'text/csv')
  @ApiOkResponse({
    description:
      'Metrics for the range plus the accounts matching `search` and `status`, newest first.',
    schema: { type: 'string', format: 'binary' },
  })
  async exportReport(
    @Req() request: AuthenticatedRequest,
    @Query() query: ExportAdminUsersQueryDto,
  ): Promise<StreamableFile> {
    const report = await this.adminUsers.exportReport(
      request.authentication.id,
      query,
    );
    return new StreamableFile(report.buffer, {
      type: report.contentType,
      disposition: `attachment; filename="${report.filename}"`,
    });
  }

  @Permissions('user.create')
  @Post()
  @ApiOperation({ summary: 'Create an account from the panel (CU57)' })
  createUser(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAdminUserDto,
  ) {
    return this.adminUsers.createUser(request.authentication.id, dto);
  }
}
