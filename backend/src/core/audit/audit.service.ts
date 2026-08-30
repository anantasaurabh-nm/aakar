import { Injectable } from '@nestjs/common';
import type { RecordStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordAuditEvent {
  tenantId: string;
  entity: string;
  recordId: string;
  action: string;
  fromStatus?: RecordStatus;
  toStatus?: RecordStatus;
  performedBy: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit trail (Module System Amendment §11-12). Never updates
 * or deletes existing events.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: RecordAuditEvent) {
    await this.prisma.auditLog.create({
      data: {
        tenantId: event.tenantId,
        entity: event.entity,
        recordId: event.recordId,
        action: event.action,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        performedBy: event.performedBy,
        reason: event.reason,
        metadata: event.metadata as never,
      },
    });
  }
}
