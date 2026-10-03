import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OptionalAuthenticationGuard } from '../auth/guards/optional-authentication.guard';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [MediaService, OptionalAuthenticationGuard],
  exports: [MediaService],
})
export class MediaModule {}
