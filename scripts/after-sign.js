/**
 * electron-builder afterSign hook — macOS ad-hoc signing.
 *
 * Runs after the signing step (which we skip via identity: null).
 * Ad-hoc signing with "-" lets macOS show "unidentified developer"
 * instead of "app is damaged" — users can right-click → Open.
 * No Apple Developer account required.
 */

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterSign(context) {
  if (process.platform !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`[after-sign] Ad-hoc signing: ${appPath}`);
  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    console.log('[after-sign] Done.');
  } catch (err) {
    console.warn('[after-sign] codesign failed (non-fatal):', err.message);
  }
};
