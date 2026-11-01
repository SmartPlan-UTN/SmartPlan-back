import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { MediaModule } from '../media/media.module';
import { PlansModule } from '../plans/plans.module';
import { User } from '../users/entities/user.entity';
import { McpKey } from './entities/mcp-key.entity';
import { McpKeyGuard } from './guards/mcp-key.guard';
import { McpActivitiesService } from './mcp-activities.service';
import { McpKeysController } from './mcp-keys.controller';
import { McpKeysService } from './mcp-keys.service';
import { McpOwnerService } from './mcp-owner.service';
import { McpPlansService } from './mcp-plans.service';
import { McpReferenceService } from './mcp-reference.service';
import { McpServerFactory } from './mcp-server.factory';
import { McpController } from './mcp.controller';
import { McpToolsController } from './mcp-tools.controller';
import { McpToolsService } from './mcp-tools.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([McpKey, User]),
    CatalogModule,
    MediaModule,
    PlansModule,
  ],
  controllers: [McpController, McpKeysController, McpToolsController],
  providers: [
    McpKeysService,
    McpKeyGuard,
    McpOwnerService,
    McpActivitiesService,
    McpPlansService,
    McpReferenceService,
    McpServerFactory,
    McpToolsService,
  ],
})
export class McpModule {}
