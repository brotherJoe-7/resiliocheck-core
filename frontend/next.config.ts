import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint and type errors both fail the production build so regressions are
  // caught on Vercel instead of reaching users. `npx eslint src` and
  // `npx tsc --noEmit` are the local equivalents.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
