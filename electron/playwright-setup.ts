import { BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getPlaywrightBrowsersPath, getChromiumExecutablePath } from './paths';

/**
 * Check if Playwright Chromium is installed, download if needed.
 * Sends progress updates to the renderer via IPC.
 */
export async function ensurePlaywrightBrowser(win: BrowserWindow | null): Promise<boolean> {
  const browsersPath = getPlaywrightBrowsersPath();

  // Check if chromium is already installed
  const execPath = getChromiumExecutablePath();
  if (execPath && fs.existsSync(execPath)) {
    console.log('[playwright-setup] Chromium found at:', execPath);
    return true;
  }

  console.log('[playwright-setup] Chromium not found, downloading...');
  win?.webContents.send('playwright-status', { status: 'downloading', message: 'Downloading browser engine (one-time setup)...' });

  // Ensure browsers directory exists
  if (!fs.existsSync(browsersPath)) {
    fs.mkdirSync(browsersPath, { recursive: true });
  }

  return new Promise((resolve) => {
    const env = {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    };

    // Use npx playwright-core to install chromium
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = execFile(npxCmd, ['playwright-core', 'install', 'chromium'], { env, timeout: 300000 }, (err) => {
      if (err) {
        console.error('[playwright-setup] Download failed:', err.message);
        win?.webContents.send('playwright-status', {
          status: 'error',
          message: 'Browser download failed. Scanning will use system Chrome as fallback.',
        });
        resolve(false);
      } else {
        console.log('[playwright-setup] Chromium installed successfully');
        win?.webContents.send('playwright-status', {
          status: 'ready',
          message: 'Browser engine ready.',
        });
        resolve(true);
      }
    });

    // Stream stdout for progress indication
    child.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        win?.webContents.send('playwright-status', { status: 'downloading', message: msg });
      }
    });
  });
}

/** Set environment variables for Playwright before any scanner code runs */
export function setPlaywrightEnvVars(): void {
  const browsersPath = getPlaywrightBrowsersPath();
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

  const execPath = getChromiumExecutablePath();
  if (execPath) {
    process.env.PLAYWRIGHT_CHROMIUM_PATH = execPath;
  }
}
