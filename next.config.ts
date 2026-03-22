import type { NextConfig } from 'next';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

const nextConfig: NextConfig = {
    output: 'standalone',
    env: {
        NEXT_PUBLIC_APP_VERSION: pkg.version,
        NEXT_PUBLIC_IS_ELECTRON: process.env.GEORANKER_IS_ELECTRON || '',
    },
};

export default nextConfig;
