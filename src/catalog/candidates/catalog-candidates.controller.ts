import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import type { SessionUserDto } from '../../auth/dto/authentication-response.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  ApiController,
  ErrorResponseDto,
} from '../../common/swagger/api-controller.decorator';
import { CatalogCandidatesService } from './catalog-candidates.service';
import {
  ApproveCatalogCandidateDto,
  BulkApproveCatalogCandidatesDto,
  DiscardCatalogCandidateDto,
  ListCatalogCandidatesQueryDto,
  UpdateCatalogCandidateDto,
} from './dto/catalog-candidate.dto';

/**
 * "Candidatos del catálogo": the human review queue for proposed activities
 * and places (RF44, CU50). Nothing reaches the catalog without passing here.
 */
@ApiController({ tag: 'Catalog candidates', authenticated: true })
@Roles('admin')
@Permissions('catalog.review')
@Controller('admin/catalog-candidates')
export class CatalogCandidatesController {
  constructor(private readonly candidates: CatalogCandidatesService) {}

  @Get()
  list(@Query() query: ListCatalogCandidatesQueryDto) {
    return this.candidates.list(query);
  }

  /** Counts per status and pending per origin, for the queue tabs. */
  @Get('counts')
  counts() {
    return this.candidates.counts();
  }

  @Get(':id')
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.candidates.detail(id);
  }

  @Patch(':id')
  @ApiBadRequestResponse({
    description: 'The edit breaks a catalog rule; errors come per field.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'The candidate was already reviewed.',
    type: ErrorResponseDto,
  })
  update(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCatalogCandidateDto,
  ) {
    return this.candidates.update(id, dto, user.id);
  }

  @Post('bulk-approve')
  @HttpCode(200)
  bulkApprove(
    @CurrentUser() user: SessionUserDto,
    @Body() dto: BulkApproveCatalogCandidatesDto,
  ) {
    return this.candidates.bulkApprove(dto.ids, user.id, dto.force ?? false);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiConflictResponse({
    description:
      'CANDIDATE_POSSIBLE_DUPLICATE (approve again with force) or CANDIDATE_NOT_PENDING.',
    type: ErrorResponseDto,
  })
  approve(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveCatalogCandidateDto,
  ) {
    return this.candidates.approve(id, user.id, dto.force ?? false);
  }

  @Post(':id/discard')
  @HttpCode(204)
  async discard(
    @CurrentUser() user: SessionUserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DiscardCatalogCandidateDto,
  ): Promise<void> {
    await this.candidates.discard(id, dto.reason, user.id);
  }
}
