import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "WealthFlow",
  description: "Personal finance, deposit planning, and net worth tracking.",
  // iOS ignores most of the web manifest; these make "Add to Home Screen" open full-screen
  // under its own name instead of as a Safari bookmark.
  appleWebApp: { capable: true, title: "WealthFlow", statusBarStyle: "default" },
};

// Tells the browser to render native UI (select dropdowns, date pickers, scrollbars)
// using dark-appropriate colors — the CSS `color-scheme` property alone doesn't
// reliably restyle the native <select> popup list on every browser/OS combo.
export const viewport: Viewport = {
  colorScheme: "dark light",
  // Tints the status bar of the installed app to match the page background.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b10" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans" suppressHydrationWarning>
      {/* Browser extensions (e.g. ColorZilla's cz-shortcut-listen) inject attributes into
          <body> before React hydrates; that mismatch isn't ours to fix. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
