import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AiFlowLoggerService {
  private readonly nestLogger = new Logger('AiFlowLogger');
  private readonly isEnabled: boolean;
  private readonly logDir: string;

  constructor() {
    this.isEnabled = process.env.LOG_AI_FLOW === 'true';
    
    // Resolve backend/_logs relative to project root or backend
    const cwd = process.cwd();
    if (cwd.endsWith('backend')) {
      this.logDir = path.resolve(cwd, '_logs');
    } else {
      this.logDir = path.resolve(cwd, 'backend/_logs');
    }

    if (this.isEnabled) {
      try {
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true });
        }
        this.nestLogger.log(`AI Flow Logger enabled. Writing logs to: ${this.logDir}`);
      } catch (err) {
        this.nestLogger.error(`Failed to create AI flow log directory at ${this.logDir}`, err);
      }
    }
  }

  private getLogFilePath(): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    return path.join(this.logDir, `log_${day}_${month}_${year}.txt`);
  }

  logStep(step: string, data: Record<string, unknown>): void {
    if (!this.isEnabled) return;

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString();
      const lines: string[] = [];

      if (step === 'USER_INPUT') {
        lines.push(`\n================================================================================`);
        lines.push(`[${timestamp}] [STEP: ${step}]`);
      } else {
        lines.push(`[${timestamp}] [STEP: ${step}]`);
      }

      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        if (typeof value === 'object' && value !== null) {
          lines.push(`  ${key}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')}`);
        } else {
          lines.push(`  ${key}: ${value}`);
        }
      }

      lines.push(`--------------------------------------------------------------------------------`);
      const content = lines.join('\n') + '\n';

      fs.appendFileSync(this.getLogFilePath(), content, 'utf8');
    } catch (err) {
      this.nestLogger.warn(`Error writing to AI flow log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
