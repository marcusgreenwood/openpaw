import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "shiki",
    // Chat SDK + Discord adapter dependencies that use native/optional modules
    "discord.js",
    "@discordjs/ws",
    "zlib-sync",
  ],
};

export default nextConfig;
