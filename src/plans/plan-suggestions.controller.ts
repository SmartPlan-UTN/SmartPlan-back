import {
  Body,
  Controller,
  NotImplementedException,
  Post,
} from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { GenerateGeminiPlanDto } from '../recommendation/gemini/dto/generate-gemini-plan.dto';

@Controller('plan-suggestions')
export class PlanSuggestionsController {
  @Permissions('plan.generate')
  @Post()
  generate(@Body() dto: GenerateGeminiPlanDto): never {
    void dto;
    throw new NotImplementedException({
      code: 'PLAN_GENERATION_NOT_AVAILABLE',
      message: 'Suggested plan generation is not available yet',
    });
  }
}
