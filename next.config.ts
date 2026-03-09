import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "rolf-prothallium-semiseriously.ngrok-free.dev",
    "localhost",
    "*.ngrok-free.dev",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "t.me",
      },
      {
        protocol: "https",
        hostname: "**.t.me",
      },
      {
        protocol: "https",
        hostname: "telegram.org",
      },
      {
        protocol: "https",
        hostname: "**.telegram.org",
      },
      {
        protocol: "https",
        hostname: "**", // allows all HTTPS sources for service icons
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/stubs/handler_api.php",
        destination: "/api/stubs/handler_api.php",
      },
    ];
  },
};

export default nextConfig;