import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * Path resolution for GBP Rank Tracker.
 * Handles three contexts: npm run dev, electron:dev, and packaged app.
 */

export function isPackaged(): boolean {
  return app.isPackaged;
}

/** User data directory — persists across updates */
export function getUserDataDir(): string {
  return app.getPath('userData');
}

/** Database file path in userData */
export function getDatabasePath(): string {
  return path.join(getUserDataDir(), 'gbp-rank-tracker.db');
}

/** Database URL for Prisma */
export function getDatabaseUrl(): string {
  return `file:${getDatabasePath()}`;
}

/**
 * App resources directory — where bundled files live.
 * Packaged: process.resourcesPath (inside .app/Contents/Resources)
 * Dev: project root
 */
export function getResourcesDir(): string {
  if (isPackaged()) {
    return process.resourcesPath;
  }
  return path.resolve(__dirname, '..');
}

/** Data directory containing postal/ JSON files */
export function getDataDir(): string {
  return path.join(getResourcesDir(), 'data');
}

/**
 * Next.js app directory — where .next/ and package.json live.
 * Packaged: inside resources (standalone output)
 * Dev: project root
 */
export function getAppDir(): string {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.resolve(__dirname, '..');
}

/** Playwright browsers directory in userData */
export function getPlaywrightBrowsersPath(): string {
  return path.join(getUserDataDir(), 'playwright-browsers');
}

/** Find the Playwright chromium executable */
export function getChromiumExecutablePath(): string | undefined {
  const browsersDir = getPlaywrightBrowsersPath();
  if (!fs.existsSync(browsersDir)) return undefined;

  // Look for chromium-* directory
  const entries = fs.readdirSync(browsersDir);
  const chromiumDir = entries.find(e => e.startsWith('chromium-') || e.startsWith('chromium_'));
  if (!chromiumDir) return undefined;

  const chromiumBase = path.join(browsersDir, chromiumDir);

  // macOS
  const macPath = path.join(chromiumBase, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
  if (fs.existsSync(macPath)) return macPath;

  // Linux
  const linuxPath = path.join(chromiumBase, 'chrome-linux', 'chrome');
  if (fs.existsSync(linuxPath)) return linuxPath;

  // Windows
  const winPath = path.join(chromiumBase, 'chrome-win', 'chrome.exe');
  if (fs.existsSync(winPath)) return winPath;

  return undefined;
}
