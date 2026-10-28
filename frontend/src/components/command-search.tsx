'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, Search } from 'lucide-react';
import { coursesApi, type CourseSummary } from '@/lib/api';
import { Kbd } from '@/components/ui/kbd';
import { cn } from '@/lib/utils';

export interface CommandLink {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

// One fetch per page load: the catalogue is small and the list is already public to signed-in users.
let catalogue: Promise<CourseSummary[]> | null = null;
const loadCatalogue = () => (catalogue ??= coursesApi.list().catch(() => ((catalogue = null), [])));

/** ⌘K / Ctrl+K or "/" opens it; courses and pages in one list, Enter on free text opens Explore. */
export function CommandSearch({ links, className }: { links: CommandLink[]; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const palette = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!palette && !slash) return;
      const t = e.target as HTMLElement | null;
      if (slash && t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      setOpen((o) => (palette ? !o : true));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    loadCatalogue().then(setCourses);
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const q = query.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-9 items-center gap-2.5 rounded-[10px] bg-surface px-3 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
          className
        )}
        aria-label="Search courses"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">Search courses</span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/30" />
          <DialogPrimitive.Content
            className="ui-popover fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-[14px] border border-border bg-popover text-popover-foreground shadow-overlay outline-none"
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
            <Command label="Search courses and pages" loop>
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search courses, instructors or pages"
                  className="h-12 w-full bg-transparent text-[15px] text-foreground outline-none placeholder:text-subtle"
                />
                <Kbd>Esc</Kbd>
              </div>
              <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
                <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {courses === null ? 'Loading courses…' : 'No course or page matches.'}
                </Command.Empty>
                {q ? (
                  <Command.Group>
                    <Item value={`search all ${q}`} onSelect={() => go(`/explore?q=${encodeURIComponent(q)}`)}>
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">
                        Search all courses for <span className="font-medium">“{q}”</span>
                      </span>
                    </Item>
                  </Command.Group>
                ) : null}
                {courses?.length ? (
                  <Command.Group heading="Courses" className={groupHeading}>
                    {courses.slice(0, 40).map((c) => (
                      <Item key={c.id} value={`${c.title} ${c.instructor?.name ?? ''} ${c.id}`} onSelect={() => go(`/courses/${c.id}`)}>
                        <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        {c.instructor?.name ? <span className="shrink-0 truncate text-xs text-muted-foreground">{c.instructor.name}</span> : null}
                      </Item>
                    ))}
                  </Command.Group>
                ) : null}
                <Command.Group heading="Go to" className={groupHeading}>
                  {links.map((l) => (
                    <Item key={l.id} value={`go ${l.label}`} onSelect={() => go(l.href)}>
                      <l.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{l.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-subtle" />
                    </Item>
                  ))}
                </Command.Group>
              </Command.List>
              <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
                <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> to open</span>
              </div>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

const groupHeading =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground';

function Item({ value, onSelect, children }: { value: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground outline-none data-[selected=true]:bg-surface"
    >
      {children}
    </Command.Item>
  );
}
