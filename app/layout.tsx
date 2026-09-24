import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "WealthFlow",
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
    <html lang="en" className="h-full antialiased font-sans" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
