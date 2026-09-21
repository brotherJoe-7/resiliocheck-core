import type { NextConfig } from "next";

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
} satisfies Partial<NextConfig> & { eslint?: { ignoreDuringBuilds?: boolean } };

export default nextConfig;
