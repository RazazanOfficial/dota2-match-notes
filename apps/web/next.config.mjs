import nextEnv from "@next/env";
import { fileURLToPath } from "node:url";

// Next normally reads env files from its own cwd; secrets stay at the repo root.
nextEnv.loadEnvConfig(fileURLToPath(new URL("../../", import.meta.url)), process.env.NODE_ENV !== "production");

const mediaBase = process.env.CLOUD_SPACE_PUBLIC_BASE_URL;
const mediaUrl = mediaBase ? new URL(mediaBase) : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: mediaUrl
      ? [
          {
            protocol: mediaUrl.protocol.replace(":", ""),
            hostname: mediaUrl.hostname,
            port: mediaUrl.port,
            pathname: "/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
