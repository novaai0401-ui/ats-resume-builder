import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // Produce standalone output for Docker/Render deployment
  output: 'standalone',
  // Force monorepo-nested standalone layout so server.js lands at
  // .next/standalone/resume-builder-web/server.js (matches Dockerfile.web).
  outputFileTracingRoot: path.join(__dirname, '..'),
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['zustand'],
  },
};

export default nextConfig;
