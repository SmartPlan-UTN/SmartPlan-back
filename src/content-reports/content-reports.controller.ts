import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiConflictResponse, ApiNotFoundResponse } from '@nestjs/swagger';
import type { SessionUserDto } from '../auth/dto/authentication-response.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiController,
  ErrorResponseDto,
} from '../common/swagger/api-controller.decorator';
import { ContentReportsService } from './content-reports.service';
import { CreateContentReportDto } from './dto/create-content-report.dto';
import { ListContentReportsQueryDto } from './dto/list-content-reports-query.dto';
import { ResolveContentReportDto } from './dto/resolve-content-report.dto';
import { ReportableContentType } from './entities/content-report.entity';

/** Report-based moderation of user content (SmartPlan-front#156). */
@ApiController({ tag: 'Content reports', authenticated: true })
@Controller()
export class ContentReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  @Permissions('content.report')
  @Post('content-reports')
  @ApiNotFoundResponse({
    description: 'The content does not exist or is no longer public.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'The user already reported this content.',
    type: ErrorResponseDto,
  })
  report(
    @CurrentUser() user: SessionUserDto,
    @Body() dto: CreateContentReportDto,
  ) {
    return this.reports.report(user.id, dto);
  }

  @Permissions('content.moderate')
  @Roles('admin')
  @Get('admin/content-reports')
  listOpen(@Query() query: ListContentReportsQueryDto) {
    return this.reports.listOpen(query);
  }

  @Permissions('content.moderate')
  @Roles('admin')
  @Get('admin/content-reports/:type/:contentId')
  @ApiNotFoundResponse({
    description: 'The content has no open reports.',
    type: ErrorResponseDto,
  })
  detail(
    @Param('type', new ParseEnumPipe(ReportableContentType))
    type: ReportableContentType,
    @Param('contentId', ParseIntPipe) contentId: number,
  ) {
    return this.reports.detail(type, contentId);
  }

  @Permissions('content.moderate')
  @Roles('admin')
  @Patch('admin/content-reports/:type/:contentId')
  @HttpCode(204)
  @ApiNotFoundResponse({
    description: 'The content has no open reports.',
    type: ErrorResponseDto,
  })
  async resolve(
    @CurrentUser() user: SessionUserDto,
    @Param('type', new ParseEnumPipe(ReportableContentType))
    type: ReportableContentType,
    @Param('contentId', ParseIntPipe) contentId: number,
    @Body() dto: ResolveContentReportDto,
  ): Promise<void> {
    await this.reports.resolve(user.id, type, contentId, dto);
  }
}
