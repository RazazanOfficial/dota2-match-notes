import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import CursorThemeProvider from "@/components/CursorThemeProvider";
import "./globals.css";
import "./dota-theme.css";
import "./cursor-themes.css";

export const metadata: Metadata = {
  title: "Dota2Notes | دفتر شخصی مچ‌های Dota 2",
  description: "مچ‌هایت را مرور کن، الگوهای بازیت را بشناس و پیشرفتت را دنبال کن.",
  icons: {
    icon: [
      { url: "/logos/logo_64x64.png", sizes: "64x64", type: "image/png" },
      { url: "/logos/logo_128x128.png", sizes: "128x128", type: "image/png" },
    ],
    shortcut: "/logos/logo_64x64.png",
    apple: "/logos/logo_256x256.png",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080a0b",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" data-cursor-pack="acid-hydra" data-cursor-effect="none">
      <body>
        <CursorThemeProvider>{children}</CursorThemeProvider>
      </body>
    </html>
  );
}
