import { chromium as pwChromium, type LaunchOptions } from 'playwright-core';

/**
 * Centralized Playwright browser launcher.
 * In Electron, uses PLAYWRIGHT_CHROMIUM_PATH env var for bundled browser.
 * In web dev mode, uses default Playwright chromium.
 */

export const chromium = pwChromium;

export function getElectronLaunchDefaults(): Partial<LaunchOptions> {
    const opts: Partial<LaunchOptions> = {};
    if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
        opts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    }
    return opts;
}
