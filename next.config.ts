import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server only answers cross-origin requests for /_next/* assets from origins
  // listed here; reaching it through an ngrok tunnel otherwise loads a page with no CSS
  // and no HMR. ngrok hands out a new subdomain each start, hence the wildcards.
  // The 192.168 range covers a phone on the same Wi-Fi opening the LAN address: with HMR
  // blocked the page renders but never becomes interactive (menus and dropdowns do nothing).
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io", "192.168.*.*"],

  // Pages that moved in the navigation redesign; old bookmarks keep working.
  async redirects() {
    return [
      { source: "/deposits", destination: "/investments", permanent: false },
      { source: "/sanchayapatra", destination: "/investments", permanent: false },
    ];
  },
};

export default nextConfig;
