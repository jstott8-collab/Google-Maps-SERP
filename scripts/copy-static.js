/**
 * Cross-platform script to copy static assets into Next.js standalone output.
 * Replaces `cp -r` which only works on Unix.
 * Usage: node scripts/copy-static.js
 */

const fs = require('fs');
const path = require('path');

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
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

// Copy .next/static → .next/standalone/.next/static
const staticSrc = path.join(root, '.next', 'static');
const staticDest = path.join(root, '.next', 'standalone', '.next', 'static');
console.log('[copy-static] Copying .next/static...');
copyDirSync(staticSrc, staticDest);

// Copy public → .next/standalone/public
const publicSrc = path.join(root, 'public');
const publicDest = path.join(root, '.next', 'standalone', 'public');
console.log('[copy-static] Copying public/...');
copyDirSync(publicSrc, publicDest);

console.log('[copy-static] Done.');
