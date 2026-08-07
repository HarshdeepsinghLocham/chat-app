import "./globals.css";
import Providers from "./providers";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Semantask",
  description: "AI-native work coordination — suggest-first work from conversation; managers approve when policy requires; autonomy optional.",
  icons: {
    icon: [{ url: "/favicon.png?v=2", type: "image/png" }],
    shortcut: "/favicon.png?v=2",
    apple: "/favicon.png?v=2",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning >
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}