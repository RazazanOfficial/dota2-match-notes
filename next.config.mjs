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
