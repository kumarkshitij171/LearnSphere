import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { loadUiConfig } from "@/lib/ui-config/server";
import { UiConfigProvider, themeVars } from "@/lib/ui-config";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { AppProviders } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

// Next dedupes this fetch with the one in RootLayout.
export async function generateMetadata(): Promise<Metadata> {
  const { config } = await loadUiConfig();
  return {
    title: `${config.branding.appName} — ${config.branding.tagline}`,
    description: config.home.hero.subtitle,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read on the server so the theme is right on first paint, not swapped in after hydration.
  const { config } = await loadUiConfig();
  return (
    <html lang="en" className="dark" style={themeVars(config.theme) as React.CSSProperties}>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans`}
      >
        <UiConfigProvider config={config}>
          <AppProviders>
            <AnnouncementBanner />
            {children}
          </AppProviders>
        </UiConfigProvider>
      </body>
    </html>
  );
}
