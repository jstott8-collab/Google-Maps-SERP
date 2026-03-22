import path from 'path';
import fs from 'fs';
import { getDatabasePath, isPackaged } from './paths';

/**
 * SQLite CREATE TABLE statements derived from prisma/schema.prisma.
 * Uses IF NOT EXISTS so it's safe to run on every launch.
 * This removes the need for the 100MB prisma CLI in the packaged app.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "centerLat" REAL NOT NULL,
    "centerLng" REAL NOT NULL,
    "radius" REAL NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 3,
    "shape" TEXT NOT NULL DEFAULT 'SQUARE',
    "customPoints" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "nextRun" DATETIME,
    "businessName" TEXT,
    "placeId" TEXT,
    "currentRunId" TEXT
);

CREATE TABLE IF NOT EXISTS "Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "runId" TEXT,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "rank" INTEGER,
    "targetName" TEXT,
    "placeId" TEXT,
    "cid" TEXT,
    "topResults" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Proxy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "type" TEXT NOT NULL DEFAULT 'RESIDENTIAL',
    "enabled" BOOLEAN NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'UNTESTED',
    "lastTestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "GlobalSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "source" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GridPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "centerLat" REAL NOT NULL,
    "centerLng" REAL NOT NULL,
    "radius" REAL NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 3,
    "shape" TEXT NOT NULL DEFAULT 'SQUARE',
    "customPoints" TEXT,
    "locationName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SavedBusiness" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "placeId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "category" TEXT,
    "googleUrl" TEXT,
    "lat" REAL,
    "lng" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ReviewAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessName" TEXT NOT NULL,
    "businessUrl" TEXT NOT NULL,
    "placeId" TEXT,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "averageRating" REAL NOT NULL DEFAULT 0,
    "analysisData" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "currentRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "runId" TEXT,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerName" TEXT NOT NULL,
    "reviewerUrl" TEXT,
    "reviewImage" TEXT,
    "reviewCount" INTEGER,
    "photoCount" INTEGER,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "publishedDate" TEXT,
    "responseText" TEXT,
    "responseDate" TEXT,
    "sentimentScore" REAL,
    "sentimentLabel" TEXT,
    "isLikelyFake" BOOLEAN NOT NULL DEFAULT 0,
    "fakeScore" REAL,
    "analysisBlob" TEXT,
    CONSTRAINT "Review_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ReviewAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Scan_status_idx" ON "Scan"("status");
CREATE INDEX IF NOT EXISTS "Scan_createdAt_idx" ON "Scan"("createdAt");
CREATE INDEX IF NOT EXISTS "Scan_nextRun_idx" ON "Scan"("nextRun");
CREATE INDEX IF NOT EXISTS "Result_scanId_idx" ON "Result"("scanId");
CREATE INDEX IF NOT EXISTS "Result_scanId_runId_idx" ON "Result"("scanId", "runId");
CREATE UNIQUE INDEX IF NOT EXISTS "Proxy_host_port_key" ON "Proxy"("host", "port");
CREATE INDEX IF NOT EXISTS "Alert_read_idx" ON "Alert"("read");
CREATE INDEX IF NOT EXISTS "Alert_scanId_idx" ON "Alert"("scanId");
CREATE UNIQUE INDEX IF NOT EXISTS "GlobalSetting_key_key" ON "GlobalSetting"("key");
CREATE INDEX IF NOT EXISTS "Webhook_enabled_idx" ON "Webhook"("enabled");
CREATE INDEX IF NOT EXISTS "GridPreset_name_idx" ON "GridPreset"("name");
CREATE INDEX IF NOT EXISTS "SavedBusiness_name_idx" ON "SavedBusiness"("name");
CREATE INDEX IF NOT EXISTS "ReviewAnalysis_status_idx" ON "ReviewAnalysis"("status");
CREATE INDEX IF NOT EXISTS "ReviewAnalysis_createdAt_idx" ON "ReviewAnalysis"("createdAt");
CREATE INDEX IF NOT EXISTS "Review_analysisId_idx" ON "Review"("analysisId");
CREATE INDEX IF NOT EXISTS "Review_analysisId_runId_idx" ON "Review"("analysisId", "runId");

-- Prisma migrations table (so Prisma client doesn't complain)
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
`;

/**
 * Columns that may have been added after initial table creation.
 * ALTER TABLE ADD COLUMN is idempotent-safe in SQLite (errors if exists, which we catch).
 */
const MIGRATION_COLUMNS = [
  { table: 'Result', column: 'runId', type: 'TEXT' },
  { table: 'Result', column: 'runAt', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  { table: 'Scan', column: 'currentRunId', type: 'TEXT' },
  { table: 'ReviewAnalysis', column: 'currentRunId', type: 'TEXT' },
  { table: 'Review', column: 'runId', type: 'TEXT' },
  { table: 'Review', column: 'runAt', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  { table: 'Result', column: 'cid', type: 'TEXT' },
  { table: 'Scan', column: 'placeId', type: 'TEXT' },
  { table: 'Scan', column: 'customPoints', type: 'TEXT' },
];

export function setupDatabase(): void {
  const dbPath = getDatabasePath();
  const dbDir = path.dirname(dbPath);

  // Ensure userData directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Check for legacy location (web dev → desktop migration)
  if (!fs.existsSync(dbPath)) {
    console.log('[db-setup] Database not found, checking legacy location...');
    const legacyDb = path.join(process.cwd(), 'prisma', 'dev.db');
    if (fs.existsSync(legacyDb)) {
      fs.copyFileSync(legacyDb, dbPath);
      console.log('[db-setup] Migrated database from legacy location');
    }
  }

  // Apply schema using better-sqlite3 (bundled with prisma, always available)
  try {
    // Use dynamic require to load better-sqlite3 from the app
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);

    // Enable WAL mode for better concurrent performance
    db.pragma('journal_mode = WAL');

    // Create all tables and indexes
    db.exec(SCHEMA_SQL);
    console.log('[db-setup] Schema applied successfully');

    // Apply column migrations (safe for existing databases)
    for (const { table, column, type } of MIGRATION_COLUMNS) {
      try {
        db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
        console.log(`[db-setup] Added column ${table}.${column}`);
      } catch {
        // Column already exists — expected
      }
    }

    db.close();
    console.log('[db-setup] Database ready');
  } catch (err: any) {
    console.error('[db-setup] Schema setup error:', err.message);
    // If better-sqlite3 isn't available, fall back to prisma CLI
    fallbackPrismaSetup(dbPath);
  }
}

function fallbackPrismaSetup(dbPath: string): void {
  try {
    const { execSync } = require('child_process');
    const { getResourcesDir } = require('./paths');

    const schemaPath = isPackaged()
      ? path.join(getResourcesDir(), 'prisma', 'schema.prisma')
      : path.join(__dirname, '..', 'prisma', 'schema.prisma');

    const env = {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    };

    execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate --accept-data-loss`, {
      env,
      stdio: 'pipe',
      timeout: 30000,
    });
    console.log('[db-setup] Fallback prisma push complete');
  } catch (err: any) {
    console.error('[db-setup] Fallback prisma push failed:', err.message);
  }
}
