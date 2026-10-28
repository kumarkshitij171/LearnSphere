'use client';

import { Check } from 'lucide-react';
import { Logo } from '@/components/brand';
import { ThemeToggleButton } from '@/components/theme-toggle';
import { TwoTone } from '@/components/ui/two-tone';
import { useUiConfig } from '@/lib/ui-config';

/**
 * Sign-in and sign-up: a quiet panel of true statements from the UI config on the left (wide
 * screens only), the form on the right.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { auth, branding } = useUiConfig();
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-[44%] flex-col justify-between bg-surface p-12 lg:flex xl:w-1/2 xl:p-16">
        <Logo />
        <div className="max-w-md space-y-8">
          <TwoTone as="h2" lead={auth.heading.title} trail={auth.heading.titleHighlight} breakLine className="text-display-l" />
          {auth.points.length ? (
            <ul className="space-y-3">
              {auth.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[15px] text-body">
                  <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-md bg-highlight text-highlight-foreground">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="text-[13px] text-muted-foreground">
          © {new Date().getFullYear()} {branding.appName}
        </p>
      </aside>

      <div className="relative flex w-full flex-col px-4 py-6 sm:px-8 lg:w-[56%] lg:px-12 xl:w-1/2">
        <div className="flex items-center justify-between">
          <span className="lg:invisible">
            <Logo />
          </span>
          <ThemeToggleButton />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </div>
    </div>
  );
}
