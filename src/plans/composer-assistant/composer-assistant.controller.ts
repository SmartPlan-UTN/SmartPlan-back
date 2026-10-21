import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import type { AuthenticatedRequest } from '../../auth/types/authenticated-request';
import { ApiController } from '../../common/swagger/api-controller.decorator';
import {
  AssistantImproveDto,
  AssistantSearchDto,
  AssistantSuggestDto,
} from './composer-assistant.dto';
import {
  AssistantContext,
  AssistantImproveResponse,
  AssistantSearchResponse,
  AssistantSuggestResponse,
  ComposerAssistantService,
} from './composer-assistant.service';

/**
 * Help for the person building a plan by hand. Every endpoint is stateless,
 * read-only and answers with proposals: nothing here creates or changes a plan.
 * They answer `503 ASSISTANT_UNAVAILABLE` when the model is slow or down and
 * `429 ASSISTANT_RATE_LIMITED` past the per-person budget; either way the
 * composer carries on with its regular search. If the client goes away before
 * the answer (a newer search replaced it, the tab closed) the provider call is
 * cancelled.
 */
@ApiController({ tag: 'My plans', authenticated: true })
@Controller('users/me/plans/assistant')
export class ComposerAssistantController {
  constructor(private readonly assistant: ComposerAssistantService) {}

  /** Natural-language search over the real catalog. */
  @Permissions('plan.create')
  @Post('search')
  @HttpCode(200)
  search(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: AssistantSearchDto,
  ): Promise<AssistantSearchResponse> {
    return this.assistant.search(dto, this.context(request, response));
  }

  /** Activities that complement the route, and a missing kind of activity if there is one. */
  @Permissions('plan.create')
  @Post('suggest')
  @HttpCode(200)
  suggest(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: AssistantSuggestDto,
  ): Promise<AssistantSuggestResponse> {
    return this.assistant.suggest(dto, this.context(request, response));
  }

  /** At most three proposed improvements to the route, each with its computed effect. */
  @Permissions('plan.create')
  @Post('improve')
  @HttpCode(200)
  improve(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
    @Body() dto: AssistantImproveDto,
  ): Promise<AssistantImproveResponse> {
    return this.assistant.improve(dto, this.context(request, response));
  }

  private context(
    request: AuthenticatedRequest,
    response: Response,
  ): AssistantContext {
    const controller = new AbortController();
    response.on('close', () => {
      if (!response.writableFinished) controller.abort();
    });
    return { userId: request.authentication.id, signal: controller.signal };
  }
}
