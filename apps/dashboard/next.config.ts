import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Standalone tracing must start at the monorepo root so workspace packages are included.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default config;
