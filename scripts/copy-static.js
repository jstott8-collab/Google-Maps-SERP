/**
 * Cross-platform script to copy static assets into Next.js standalone output.
 * Replaces `cp -r` which only works on Unix.
 * Usage: node scripts/copy-static.js
 */

const fs = require('fs');
const path = require('path');

function copyDirSync(src, dest, required = false) {
  if (!fs.existsSync(src)) {
    if (required) {
      console.error(`[copy-static] ERROR: Required directory not found: ${src}`);
      console.error('[copy-static] Run "npx next build" first.');
      process.exit(1);
    }
    console.log(`[copy-static] Skipping ${src} (not found)`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const root = path.resolve(__dirname, '..');

// Verify standalone output exists before copying into it
const standaloneDir = path.join(root, '.next', 'standalone');
if (!fs.existsSync(standaloneDir)) {
  console.error('[copy-static] ERROR: .next/standalone not found — run "npx next build" first.');
  process.exit(1);
}

// Copy .next/static → .next/standalone/.next/static (required)
const staticSrc = path.join(root, '.next', 'static');
const staticDest = path.join(root, '.next', 'standalone', '.next', 'static');
console.log('[copy-static] Copying .next/static...');
copyDirSync(staticSrc, staticDest, true);

// Copy public → .next/standalone/public (optional — may not exist in all setups)
const publicSrc = path.join(root, 'public');
const publicDest = path.join(root, '.next', 'standalone', 'public');
console.log('[copy-static] Copying public/...');
copyDirSync(publicSrc, publicDest, false);

console.log('[copy-static] Done.');
