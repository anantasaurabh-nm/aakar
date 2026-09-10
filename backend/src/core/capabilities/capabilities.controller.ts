import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { CapabilityRegistry } from './capability-registry.service';

@Controller('data/capabilities')
@UseGuards(JwtAuthGuard)
export class CapabilitiesController {
  constructor(private readonly capabilityRegistry: CapabilityRegistry) {}

  @Get(':capabilityId')
  async execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('capabilityId') capabilityId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const result = await this.capabilityRegistry.execute(capabilityId, query, user);

    // If the capability produces dashboard cards, return them directly for Dashboard component
    if (result.rows?.[0] && typeof result.rows[0] === 'object' && 'cards' in result.rows[0]) {
      return result.rows[0];
    }

    // Standard list / table format
    return {
      items: result.rows ?? [],
      total: result.total ?? result.rows?.length ?? 0,
      operation: result.operation,
      module: result.module,
      entity: result.entity,
    };
  }
}
