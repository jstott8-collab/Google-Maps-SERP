/**
 * Development script: starts Next.js dev server, then launches Electron.
 * Usage: node scripts/electron-dev.js
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, '..');

function waitForServer(port, timeout = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Server did not start within ${timeout}ms`));
      }
      const req = http.get(`http://127.0.0.1:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => setTimeout(check, 500));
      req.setTimeout(1000, () => {
        req.destroy();
        setTimeout(check, 500);
      });
    };
    check();
  });
}

async function main() {
  console.log('[electron-dev] Starting Next.js dev server...');

  // Start Next.js dev server
  const nextDev = spawn('npx', ['next', 'dev', '--port', String(PORT)], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      GEORANKER_IS_ELECTRON: '1',
      GEORANKER_DATA_DIR: path.join(ROOT, 'data'),
    },
  });

  nextDev.on('error', (err) => {
    console.error('[electron-dev] Failed to start Next.js:', err);
    process.exit(1);
  });

  // Wait for Next.js to be ready
  console.log(`[electron-dev] Waiting for server on port ${PORT}...`);
  try {
    await waitForServer(PORT);
  } catch (err) {
    console.error('[electron-dev]', err.message);
    nextDev.kill();
    process.exit(1);
  }

  console.log('[electron-dev] Server ready! Launching Electron...');

  // Compile electron TypeScript
  const tscResult = require('child_process').spawnSync(
    'npx', ['tsc', '-p', 'electron/tsconfig.json'],
    { cwd: ROOT, stdio: 'inherit', shell: true }
  );

  if (tscResult.status !== 0) {
    console.error('[electron-dev] TypeScript compilation failed');
    nextDev.kill();
    process.exit(1);
  }

  // Launch Electron
  const electron = spawn('npx', ['electron', '.'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      GEORANKER_IS_ELECTRON: '1',
      GEORANKER_DATA_DIR: path.join(ROOT, 'data'),
    },
  });

  electron.on('close', (code) => {
    console.log(`[electron-dev] Electron exited with code ${code}`);
    nextDev.kill();
    process.exit(code || 0);
  });

  // Clean up on SIGINT/SIGTERM
  const cleanup = () => {
    nextDev.kill();
    electron.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main();
