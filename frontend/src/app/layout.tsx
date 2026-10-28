import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { loadUiConfig } from "@/lib/ui-config/server";
import { UiConfigProvider, themeLook, themeVars } from "@/lib/ui-config";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { AppProviders } from "@/components/providers";
import { LOOK_BOOT_SCRIPT, LOOK_COOKIE, parsePreference } from "@/lib/look";

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
  // Read on the server so the look and highlight are right on first paint, not swapped in after hydration.
  const { config } = await loadUiConfig();
  // an explicit light/dark choice renders right on the server; "system" is settled by the boot script
  const pref = parsePreference(cookies().get(LOOK_COOKIE)?.value);
  const look = pref === "dark" ? "theater" : pref === "light" ? "studio" : themeLook(config.theme);
  return (
    <html
      lang="en"
      data-look={look}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      style={themeVars(config.theme) as React.CSSProperties}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOOK_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans">
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
