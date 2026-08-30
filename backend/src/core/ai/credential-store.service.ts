import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProviderId } from '@erp/shared-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';

/**
 * Secure server-side credential store (AI Models PRD §9-10). Secrets are
 * encrypted at rest and only ever decrypted inside this service, right
 * before a provider adapter call. They never reach the browser, the AI
 * model, module code, or logs.
 */
@Injectable()
export class CredentialStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async save(name: string, provider: ProviderId, secretValue: string) {
    const encryptedValue = this.crypto.encrypt(secretValue);
    return this.prisma.credential.upsert({
      where: { name },
      create: { name, provider, encryptedValue },
      update: { provider, encryptedValue },
    });
  }

  async resolve(name: string): Promise<{ provider: ProviderId; secret: string }> {
    const record = await this.prisma.credential.findUnique({ where: { name } });
    if (!record) throw new NotFoundException(`Credential "${name}" is not configured`);
    return { provider: record.provider, secret: this.crypto.decrypt(record.encryptedValue) };
  }

  async list() {
    const rows = await this.prisma.credential.findMany({
      select: { name: true, provider: true, updatedAt: true },
    });
    return rows; // never includes encryptedValue
  }

  async remove(name: string) {
    await this.prisma.credential.delete({ where: { name } });
  }
}
