// Mirrors backend/config/ui/ui-config.schema.json (schemaVersion 1). The backend validates;
// this is the shape the UI reads.

export type NavIconName =
  | 'LayoutDashboard' | 'BookOpen' | 'Bookmark' | 'ClipboardList' | 'Compass' | 'Award' | 'Receipt'
  | 'HelpCircle' | 'Settings' | 'ShieldCheck' | 'SlidersHorizontal' | 'GraduationCap' | 'Users'
  | 'PlayCircle' | 'Bell' | 'Sparkles';

export type UiRole = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';

export interface NavItemConfig {
  id: string;
  label: string;
  icon: NavIconName;
  /** null = shown as not yet available */
  href: string | null;
  /** [] = everyone. Cosmetic: routes and APIs enforce access. */
  roles: UiRole[];
  enabled: boolean;
}

export type HomeSectionType = 'features' | 'howItWorks' | 'finalCta';

export interface UiConfig {
  schemaVersion: 1;
  branding: {
    appName: string;
    wordmark: { primary: string; accent: string };
    tagline: string;
    logoUrl: string | null;
    supportEmail: string;
  };
  theme: { primary: string; accent: string; background: string; radius: string };
  navigation: { sidebar: NavItemConfig[]; sidebarBottom: NavItemConfig[] };
  home: {
    hero: {
      eyebrow: string;
      title: string;
      titleHighlight: string;
      subtitle: string;
      ctaLabel: string;
      ctaHref: string;
      footnote: string;
    };
    sections: { type: HomeSectionType; enabled: boolean }[];
  };
  features: { purchases: boolean; instructorRequests: boolean; studyProgress: boolean };
  copy: { courseLocked: string; purchasesPaused: string; emptyCatalogue: string };
  announcement: { enabled: boolean; message: string; tone: 'info' | 'success' | 'warning'; href: string | null };
}

export interface PublishedUiConfig {
  version: number;
  checksum: string;
  config: UiConfig;
  fallback: boolean;
}
