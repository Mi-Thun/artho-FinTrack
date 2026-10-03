import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server only answers cross-origin requests for /_next/* assets from origins
  // listed here; reaching it through an ngrok tunnel otherwise loads a page with no CSS
  // and no HMR. ngrok hands out a new subdomain each start, hence the wildcards.
  // The 192.168 range covers a phone on the same Wi-Fi opening the LAN address: with HMR
  // blocked the page renders but never becomes interactive (menus and dropdowns do nothing).
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io", "192.168.*.*"],

  experimental: {
    // Every page is dynamic, so by default the router refetched a page each time it was
    // opened, even one viewed seconds earlier. Reusing a visit for 30s makes going back
    // and forth between pages instant. It can't show a stale figure after a change made
    // here: every server action calls revalidatePath, and sign-in/out set cookies, both of
    // which clear this cache. Only a change from another device or household member can
    // take up to 30s to appear.
    staleTimes: { dynamic: 30 },
  },

  // Pages that moved in the navigation redesign; old bookmarks keep working.
  async redirects() {
    return [
      { source: "/deposits", destination: "/investments", permanent: false },
      { source: "/sanchayapatra", destination: "/investments", permanent: false },
    ];
  },
};

export default nextConfig;
