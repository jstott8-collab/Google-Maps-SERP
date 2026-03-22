import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain, app } from 'electron';

let mainWindow: BrowserWindow | null = null;
let handlersRegistered = false;

/**
 * Register IPC handlers for version info.
 * Called always (dev + production) so the renderer can query version.
 */
export function registerVersionHandlers() {
  if (handlersRegistered) return; // prevent double-registration
  handlersRegistered = true;

  ipcMain.handle('get-version', () => {
    return app.getVersion();
  });
}

/**
 * Initialize the full auto-updater. Only call in production (packaged) builds.
 */
export function initUpdater(win: BrowserWindow) {
  mainWindow = win;

  // Don't auto-download — let user decide
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Forward events to renderer
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-not-available', () => {
    // Silent — no action needed
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded', {});
  });

  autoUpdater.on('error', (err) => {
    // Silently handle network errors (offline, DNS, timeout)
    const msg = err?.message || '';
    const isNetworkError = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|net::ERR_/.test(msg);
    if (isNetworkError) {
      console.log('[updater] Network unavailable, skipping update check');
    } else {
      console.error('[updater] Error:', msg);
    }
  });

  // IPC handlers for update actions
  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { updateAvailable: !!result?.updateInfo };
    } catch (err: any) {
      const msg = err?.message || '';
      const isNetworkError = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|net::ERR_/.test(msg);
      if (isNetworkError) {
        return { updateAvailable: false, offline: true };
      }
      return { error: msg };
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      return { error: err.message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Check for updates after a short delay (non-blocking, offline-safe)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore — user is offline or GitHub unreachable
    });
  }, 5000);
}
