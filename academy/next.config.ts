import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker builds
  output: 'standalone',
  
  // Enable experimental features if needed
  experimental: {
    // Add any experimental features here
  },
  
  /* other config options here */
};

export default nextConfig;