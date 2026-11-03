'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand';
import {
  UiConfigProvider,
  looksLikeUiConfig,
  navIcon,
  themeVars,
  visibleNav,
  type NavItemConfig,
  type UiConfig,
} from '@/lib/ui-config';
import { Segmented } from './segmented';

type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN';
const ROLES: Role[] = ['STUDENT', 'INSTRUCTOR', 'ADMIN'];
const TONE_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle } as const;
const TONE_SURFACE = { info: 'bg-info/10', success: 'bg-success/10', warning: 'bg-warning/10' } as const;
const TONE_TEXT = { info: 'text-info', success: 'text-success', warning: 'text-warning' } as const;

const sameItem = (a: NavItemConfig, b: NavItemConfig | undefined) =>
  !!b && a.label === b.label && a.href === b.href && a.icon === b.icon && a.section === b.section && a.enabled === b.enabled && a.count === b.count;

/**
 * The draft rendered with the app's own pieces before it is published: the real Logo through a
 * UiConfigProvider fed the draft, the sidebar built by the same visibleNav/navIcon the AppShell
 * uses, and the theme applied as CSS variables scoped to this box only.
 */
export function ConfigPreview({ draft, live, role }: { draft: UiConfig | null; live: UiConfig | null; role: string }) {
  const [source, setSource] = useState<'draft' | 'live'>('draft');
  const [viewAs, setViewAs] = useState<Role>((ROLES as string[]).includes(role) ? (role as Role) : 'STUDENT');
  const config = source === 'draft' ? draft : live;
  const liveItems = new Map((live?.navigation.sidebar ?? []).map((item) => [item.id, item]));

  return (
    <section aria-label="Preview" className="overflow-hidden rounded-[14px] border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <h2 className="text-[13px] font-medium">Preview</h2>
        <Segmented
          label="Preview source"
          value={source}
          onChange={setSource}
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'live', label: 'Live' },
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2 text-[12px] text-muted-foreground">
        View as
        <Segmented
          label="View as"
          value={viewAs}
          onChange={setViewAs}
          options={ROLES.map((r) => ({ value: r, label: r.charAt(0) + r.slice(1).toLowerCase() }))}
        />
      </div>

      {!config || !looksLikeUiConfig(config) ? (
        <p className="flex items-start gap-2 p-4 text-[13px] text-body">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          The draft is not a complete configuration yet. Fix its problems to preview it.
        </p>
      ) : (
        <UiConfigProvider config={config}>
          <PreviewBody config={config} viewAs={viewAs} changed={(item) => source === 'draft' && !sameItem(item, liveItems.get(item.id))} />
        </UiConfigProvider>
      )}
    </section>
  );
}

function PreviewBody({ config, viewAs, changed }: { config: UiConfig; viewAs: Role; changed: (item: NavItemConfig) => boolean }) {
  const nav = visibleNav(config.navigation.sidebar, viewAs);
  const groups: Array<{ label: string; items: NavItemConfig[] }> = [];
  for (const item of nav) {
    const label = item.section ?? '';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  const { announcement, home, features } = config;
  const ToneIcon = TONE_ICON[announcement.tone] ?? Info;

  return (
    <div style={themeVars(config.theme) as React.CSSProperties} className="space-y-3 bg-background p-3.5 text-foreground">
      {announcement.enabled && announcement.message ? (
        <div className={cn('flex items-start gap-2 rounded-[10px] px-3 py-2 text-[12.5px] leading-snug', TONE_SURFACE[announcement.tone])}>
          <ToneIcon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', TONE_TEXT[announcement.tone])} />
          <span className="min-w-0">{announcement.message}</span>
        </div>
      ) : null}

      <div className="rounded-[12px] border border-border bg-surface/60 p-2.5">
        <div className="mb-2 origin-left scale-90 px-1">
          <Logo href="" />
        </div>
        {groups.map((group, i) => (
          <div key={`${group.label}-${i}`} className="mt-1 first:mt-0">
            {group.label ? <p className="px-2 pb-1 pt-2 text-[11.5px] font-medium text-muted-foreground">{group.label}</p> : null}
            {group.items.map((item) => {
              const Icon = navIcon(item.icon);
              const isChanged = changed(item);
              return (
                <div
                  key={item.id}
                  className={cn('flex h-8 items-center gap-2.5 rounded-lg px-2 text-[12.5px] text-body', isChanged && 'bg-info/10 text-foreground', !item.href && 'opacity-60')}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {isChanged ? (
                    <>
                      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
                      <span className="sr-only">(changed in your draft)</span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="rounded-[12px] border border-border p-3.5">
        <p className="text-[11px] font-medium text-muted-foreground">{home.hero.eyebrow}</p>
        <p className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight">
          {home.hero.title} <span className="rounded bg-highlight px-1 text-highlight-foreground">{home.hero.titleHighlight}</span>
        </p>
        <p className="mt-1.5 line-clamp-3 text-[12px] leading-snug text-body">{home.hero.subtitle}</p>
        <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground">
          {home.hero.ctaLabel} <ArrowRight className="h-3 w-3" />
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11.5px]">
        {Object.entries(features).map(([flag, on]) => (
          <span key={flag} className={cn('rounded-md px-1.5 py-0.5 font-mono', on ? 'bg-success/10 text-success' : 'bg-surface text-muted-foreground line-through')}>
            {flag}
          </span>
        ))}
      </div>
    </div>
  );
}
