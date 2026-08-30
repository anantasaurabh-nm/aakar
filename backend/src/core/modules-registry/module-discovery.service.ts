import { Injectable } from '@nestjs/common';
import { discoverModulesOnDisk } from '../entity-engine/module-schema-loader';
import { ModuleRegistryService } from './module-registry.service';

@Injectable()
export class ModuleDiscoveryService {
  constructor(private readonly moduleRegistry: ModuleRegistryService) {}

  /** Scans public_html/modules/*\/module.json and registers any not already known. */
  async discover(): Promise<{ discovered: string[]; alreadyKnown: string[] }> {
    const discovered: string[] = [];
    const alreadyKnown: string[] = [];

    for (const { manifest } of discoverModulesOnDisk()) {
      const existing = await this.moduleRegistry.get(manifest.id);
      if (existing) {
        alreadyKnown.push(manifest.id);
        continue;
      }
      await this.moduleRegistry.upsertIfNew({ ...manifest, icon: manifest.id }, 'discovered');
      discovered.push(manifest.id);
    }
    return { discovered, alreadyKnown };
  }
}
