import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { clearRefreshCookie } from '../auth/auth-http.util';
import { Permissions } from '../auth/decorators/permissions.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { EnvironmentVariables } from '../config/environment-variables';
import { ApiController } from '../common/swagger/api-controller.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UserPreferencesResponseDto } from './dto/user-preferences-response.dto';
import { UsersService } from './users.service';

@ApiController({ tag: 'Profile', authenticated: true })
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly configuration: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Permissions('profile.view')
  @Get('me')
  getProfile(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserProfileResponseDto> {
    return this.users.getProfile(request.authentication.id);
  }

  @Permissions('profile.update')
  @Patch('me')
  updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.users.updateProfile(request.authentication.id, dto);
  }

  @Permissions('profile.change-password')
  @Patch('me/password')
  @HttpCode(204)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.users.changePassword(request.authentication.id, dto);
  }

  @Permissions('profile.delete')
  @Delete('me')
  @HttpCode(204)
  async deleteAccount(
    @Req() request: AuthenticatedRequest,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.users.deleteAccount(request.authentication.id, dto);
    clearRefreshCookie(response, this.configuration);
  }

  @Permissions('preference.update')
  @Get('me/preferences')
  getPreferences(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserPreferencesResponseDto> {
    return this.users.getPreferences(request.authentication.id);
  }

  @Permissions('preference.update')
  @Patch('me/preferences')
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<UserPreferencesResponseDto> {
    return this.users.updatePreferences(request.authentication.id, dto);
  }
}
