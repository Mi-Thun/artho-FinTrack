import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server only answers cross-origin requests for /_next/* assets from origins
  // listed here; reaching it through an ngrok tunnel otherwise loads a page with no CSS
  // and no HMR. ngrok hands out a new subdomain each start, hence the wildcards.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
};

export default nextConfig;
