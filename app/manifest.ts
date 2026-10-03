import type { MetadataRoute } from "next";

// Makes the app installable: "Add to Home Screen" on iOS Safari, the install prompt on
// Android Chrome, and the source PWABuilder/Bubblewrap read to package an Android APK.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "WealthFlow",
    short_name: "WealthFlow",
    description: "Personal finance, deposit planning, and net worth tracking.",
    // A static splash that hands over to /dashboard — see app/launch/page.tsx.
    start_url: "/launch",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f5fb",
    theme_color: "#f4f5fb",
    // The ?v= busts cached copies: bump it whenever the icon art changes, or browsers and
    // installed apps keep showing the old icon under the same file name.
    icons: [
      { src: "/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      // The glyph sits well inside the 80% safe zone, so the same art works when Android
      // crops it to a circle or squircle.
      { src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
