import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiController } from '../common/swagger/api-controller.decorator';
import {
  MAX_UI_KIT_CLAIM,
  UiKitAllowanceService,
  type UiKitClaimDto,
} from './ui-kit-allowance.service';

class UiKitClaimBody {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_UI_KIT_CLAIM)
  count: number;

  /** Free-form screen name for the usage log ("explore", "quick-view"). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  screen?: string;
}

// Public like Explore itself. A client that abuses it can only exhaust the
// free allowance (cards fall back to SmartPlan artwork); it can never cause a
// paid call. Throttled per client on top of the monthly cap.
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@UseGuards(ThrottlerGuard)
@Public()
@ApiController({ tag: 'External place photos' })
@Controller('external-integration/ui-kit')
export class UiKitAllowanceController {
  constructor(private readonly allowance: UiKitAllowanceService) {}

  /** Grants up to `count` Places UI Kit element instantiations. */
  @Post('claims')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  claim(@Body() body: UiKitClaimBody): Promise<UiKitClaimDto> {
    return this.allowance.claim(body.count, body.screen ?? 'web');
  }
}
