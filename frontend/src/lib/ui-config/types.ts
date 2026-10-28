// Mirrors backend/config/ui/ui-config.schema.json (schemaVersion 2). The backend validates;
// this is the shape the UI reads.

export type NavIconName =
  | 'LayoutDashboard' | 'BookOpen' | 'Bookmark' | 'ClipboardList' | 'Compass' | 'Award' | 'Receipt'
  | 'HelpCircle' | 'Settings' | 'ShieldCheck' | 'SlidersHorizontal' | 'GraduationCap' | 'Users'
  | 'PlayCircle' | 'Bell' | 'Sparkles' | 'MonitorPlay' | 'History' | 'Keyboard' | 'Wallet' | 'Mail'
  | 'ListChecks' | 'Upload' | 'Gauge';

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

export type HomeSectionType = 'features' | 'howItWorks' | 'faq' | 'finalCta';

/** `title` in ink, `titleHighlight` in the second tone. */
export interface TwoToneHeading {
  title: string;
  titleHighlight: string;
}

export interface UiConfig {
  schemaVersion: 2;
  branding: {
    appName: string;
    wordmark: { primary: string; accent: string };
    tagline: string;
    logoUrl: string | null;
    supportEmail: string;
  };
  theme: { mode: 'light' | 'dark'; highlight: string; radius: string };
  navigation: { sidebar: NavItemConfig[]; sidebarBottom: NavItemConfig[] };
  home: {
    hero: {
      eyebrow: string;
      title: string;
      titleHighlight: string;
      subtitle: string;
      ctaLabel: string;
      ctaHref: string;
      secondaryLabel: string;
      secondaryHref: string;
      footnote: string;
    };
    sections: { type: HomeSectionType; enabled: boolean }[];
    features: { eyebrow: string; heading: TwoToneHeading; items: { icon: NavIconName; title: string; body: string }[] };
    howItWorks: { eyebrow: string; heading: TwoToneHeading; steps: { title: string; body: string }[] };
    faq: { heading: TwoToneHeading; items: { question: string; answer: string }[] };
    finalCta: { heading: TwoToneHeading; body: string; ctaLabel: string; ctaHref: string };
  };
  auth: { heading: TwoToneHeading; points: string[] };
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
