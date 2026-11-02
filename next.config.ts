import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // scripts/make-portable.mjs sets this to get a self-contained server for the room laptop download
  output: process.env.LIVECAP_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
