'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand';
import {
  UiConfigProvider,
  looksLikeUiConfig,
  navIcon,
  themeVars,
  visibleNav,
  type UiConfig,
} from '@/lib/ui-config';

type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
const ROLES: Role[] = ['STUDENT', 'INSTRUCTOR', 'ADMIN'];
const TONE_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle } as const;

/**
 * The draft rendered with the app's own pieces before it is published: the real Logo through a
 * UiConfigProvider fed the draft, the sidebar built by the same visibleNav/navIcon the AppShell
 * uses, and the theme applied as CSS variables scoped to this box only.
 */
export function ConfigPreview({ draft, live, role }: { draft: UiConfig | null; live: UiConfig | null; role: string }) {
  const [source, setSource] = useState<'draft' | 'live'>('draft');
  const [viewAs, setViewAs] = useState<Role>((ROLES as string[]).includes(role) ? (role as Role) : 'STUDENT');
  const config = source === 'draft' ? draft : live;

  if (!config || !looksLikeUiConfig(config)) {
    return (
      <div className="flex h-full items-center gap-2 px-4 text-[13px] text-zinc-400">
        <AlertTriangle className="h-4 w-4 text-amber-300" /> The draft is not a complete configuration yet — fix the problems to preview it.
      </div>
    );
  }

  const nav = visibleNav(config.navigation.sidebar, viewAs);
  const ToneIcon = TONE_ICON[config.announcement.tone] ?? Info;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 pb-2 text-[12px]">
        <Segmented options={['draft', 'live']} value={source} onChange={setSource} />
        <span className="text-zinc-500">view as</span>
        <Segmented options={ROLES} value={viewAs} onChange={setViewAs} />
      </div>

      <UiConfigProvider config={config}>
        <div
          style={themeVars(config.theme) as React.CSSProperties}
          className="mx-4 mb-3 flex min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-background text-foreground"
        >
          <div className="flex w-52 shrink-0 flex-col border-r border-white/10 bg-card/40 p-3">
            <div className="mb-3 origin-left scale-90">
              <Logo href="" />
            </div>
            <div className="space-y-0.5 overflow-y-auto">
              {nav.map((item) => {
                const Icon = navIcon(item.icon);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px]',
                      item.id === nav[0]?.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                      !item.href && 'opacity-60'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto">
            {config.announcement.enabled && config.announcement.message ? (
              <div className="flex items-center justify-center gap-2 border-b border-white/10 bg-primary/10 px-3 py-1.5 text-[12px]">
                <ToneIcon className="h-3.5 w-3.5" /> {config.announcement.message}
              </div>
            ) : null}
            <div className="px-6 py-6 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" /> {config.home.hero.eyebrow}
              </span>
              <h3 className="mx-auto mt-3 max-w-md font-display text-xl font-bold leading-tight">
                {config.home.hero.title} <span className="text-primary">{config.home.hero.titleHighlight}</span>
              </h3>
              <p className="mx-auto mt-2 max-w-md text-[12px] text-muted-foreground">{config.home.hero.subtitle}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground">
                {config.home.hero.ctaLabel} <ArrowRight className="h-3 w-3" />
              </span>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[11px]">
                {Object.entries(config.features).map(([flag, on]) => (
                  <span key={flag} className={cn('rounded-full border px-2 py-0.5', on ? 'border-primary/40 text-primary' : 'border-white/10 text-muted-foreground line-through')}>
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </UiConfigProvider>
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'rounded px-2 py-0.5 text-[11px] uppercase tracking-wide transition-colors',
            value === option ? 'bg-white/10 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          {option.toLowerCase()}
        </button>
      ))}
    </div>
  );
}
