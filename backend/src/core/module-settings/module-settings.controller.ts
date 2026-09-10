import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { ModuleSettingsService } from './module-settings.service';
import { getSettingsForModule, loadModuleOnDisk } from '../entity-engine/module-schema-loader';

@Controller()
@UseGuards(JwtAuthGuard)
export class ModuleSettingsController {
  constructor(private readonly settingsService: ModuleSettingsService) {}

  /**
   * Returns the SDUI FormConfig for a module's settings view.
   */
  @Get('ui/views/:module/settings')
  async getSettingsView(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') moduleId: string,
  ) {
    const roleUpper = user.role?.toUpperCase();
    const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SYSTEM_ADMIN' || roleUpper === 'SUPER_ADMIN';
    const formConfig = await this.settingsService.getSettingsFormConfig(
      user.tenantId,
      moduleId,
      user.id,
      isAdmin,
    );

    if (!formConfig) {
      throw new NotFoundException(`Module "${moduleId}" does not declare any settings.`);
    }

    return formConfig;
  }

  /**
   * Returns the active settings key-values for the current user and tenant.
   */
  @Get('data/:module/settings')
  async getSettingsData(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') moduleId: string,
  ) {
    return this.settingsService.getAll(user.tenantId, moduleId, user.id);
  }

  /**
   * Action handler: Saves updated settings for a module.
   */
  @Post('actions/:module/settings')
  async saveSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') moduleId: string,
    @Body() payload: Record<string, unknown>,
  ) {
    const roleUpper = user.role?.toUpperCase();
    const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'SYSTEM_ADMIN' || roleUpper === 'SUPER_ADMIN';
    const values = (payload.values ?? payload) as Record<string, unknown>;
    return this.settingsService.updateSettings(
      user.tenantId,
      moduleId,
      values,
      user.id,
      isAdmin,
    );
  }

  /**
   * Discovery endpoint for AI / Copilot: Explains the settings schema and current state of a module.
   */
  @Get('data/ai/modules/:module/settings')
  async getAiModuleSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('module') moduleId: string,
  ) {
    const mod = loadModuleOnDisk(moduleId);
    if (!mod) {
      throw new NotFoundException(`Module "${moduleId}" not found.`);
    }
    const schema = getSettingsForModule(moduleId);
    const values = await this.settingsService.getAll(user.tenantId, moduleId, user.id);
    return {
      moduleId,
      moduleName: mod.manifest.name,
      schema: schema ?? null,
      currentValues: values,
    };
  }
}
