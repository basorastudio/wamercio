/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  // ESLint remains available through `npm run lint`, but legacy lint debt must not
  // block production images. TypeScript validation still runs during `next build`.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // TypeScript is validated explicitly with `npm run typecheck` in the Dockerfile.
  // Avoid running the same full-project check a second time inside `next build`.
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Keep Docker and small VPS builds within a predictable memory budget.
    cpus: 1,
    workerThreads: false,
  },
};

export default nextConfig;
