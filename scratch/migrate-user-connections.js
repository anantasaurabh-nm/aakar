const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '/var/www/web/dev-doers-os-4.altovation.in/public_html/backend/.env' });
const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration...');
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ConnectionScope" AS ENUM ('tenant', 'user');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "core_connections" ADD COLUMN IF NOT EXISTS "description" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "core_connections" ADD COLUMN IF NOT EXISTS "scope" "ConnectionScope" NOT NULL DEFAULT 'user';
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "user_connections" (
      "id" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "connectionId" TEXT NOT NULL,
      "encryptedCredentials" TEXT NOT NULL,
      "maskedPreview" TEXT,
      "status" "ConnectionStatus" NOT NULL DEFAULT 'active',
      "lastTestedAt" TIMESTAMP(3),
      "lastTestedStatus" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "user_connections_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "user_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "user_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "user_connections_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "core_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_connections_tenantId_userId_connectionId_key" ON "user_connections"("tenantId", "userId", "connectionId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_connections_tenantId_userId_idx" ON "user_connections"("tenantId", "userId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_connections_connectionId_idx" ON "user_connections"("connectionId");
  `);

  console.log('Migration executed successfully!');
}

main()
  .catch((e) => {
    console.error('Migration error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
