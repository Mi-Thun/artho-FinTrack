import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Artho",
  description: "Personal finance, deposit planning, and net worth tracking.",
};

// Tells the browser to render native UI (select dropdowns, date pickers, scrollbars)
// using dark-appropriate colors — the CSS `color-scheme` property alone doesn't
// reliably restyle the native <select> popup list on every browser/OS combo.
export const viewport: Viewport = {
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
