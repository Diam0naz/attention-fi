import type { Metadata } from "next";
// Allow side-effect CSS import in TSX: project may not have CSS module typings
// @ts-ignore
import "./globals.css";

export const metadata: Metadata = {
  title: "Terminal",
  description: "Browser-based trading terminal",
};

/**
 * Applied before hydration so the theme class is present on first paint.
 * Dark is the primary theme; "light" is opt-in via localStorage.
 *
 * Fonts come from the local stacks declared in globals.css ("Inter Tight" /
 * "JetBrains Mono" when installed, metric-compatible system fallbacks with
 * tabular numerals otherwise) — no build-time font fetching, so the app
 * builds and runs fully offline.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("tt.theme");if(t==="light")document.documentElement.classList.add("light");}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
