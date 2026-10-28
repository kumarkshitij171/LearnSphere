import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // Part VIII §30.2: display is Geist at weight 600 with tight tracking, not a second family.
      fontSize: {
        "display-xl": ["clamp(2.75rem, 6vw, 4.75rem)", { lineHeight: "1.02", letterSpacing: "-0.048em", fontWeight: "600" }],
        "display-l": ["clamp(2.125rem, 4.4vw, 3.5rem)", { lineHeight: "1.05", letterSpacing: "-0.04em", fontWeight: "600" }],
        "display-m": ["clamp(1.625rem, 3vw, 2.125rem)", { lineHeight: "1.12", letterSpacing: "-0.038em", fontWeight: "600" }],
        title: ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.03em", fontWeight: "600" }],
        heading: ["1.0625rem", { lineHeight: "1.3", letterSpacing: "-0.02em", fontWeight: "600" }],
        lead: ["1.125rem", { lineHeight: "1.6" }],
      },
      boxShadow: {
        overlay: "0 18px 48px -18px rgb(17 17 19 / 0.28), 0 2px 6px -2px rgb(17 17 19 / 0.08)",
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          raised: "hsl(var(--surface-raised) / <alpha-value>)",
        },
        body: "hsl(var(--body) / <alpha-value>)",
        subtle: "hsl(var(--subtle) / <alpha-value>)",
        highlight: {
          DEFAULT: "hsl(var(--highlight) / <alpha-value>)",
          foreground: "hsl(var(--highlight-foreground) / <alpha-value>)",
        },
        success: "hsl(var(--success) / <alpha-value>)",
        warning: "hsl(var(--warning) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        info: "hsl(var(--info) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        panel: "18px",
      },
    },
  },
  plugins: [
    // `theater:` styles an element when it sits in the dark look (app-wide dark mode or the player)
    plugin(({ addVariant }) => addVariant("theater", ':is([data-look="theater"] &)')),
  ],
};
export default config;
