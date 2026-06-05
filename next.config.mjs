/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // pg / bullmq / ioredis are Node-only server packages. Keep them external so the
  // Next bundler loads them from node_modules at runtime instead of bundling them.
  serverExternalPackages: ["pg", "bullmq", "ioredis"],
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined
};

export default nextConfig;
