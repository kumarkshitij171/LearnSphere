'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import {
  Search,
  Bell,
  ChevronDown,
  ChevronLeft,
  GraduationCap,
  LogOut,
  Loader2,
  Menu,
  Receipt,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand';
import { RoleBadge } from '@/components/role-badge';
import { usersApi, type CurrentUser } from '@/lib/api';
import { navIcon, useUiConfig, visibleNav, type NavItemConfig } from '@/lib/ui-config';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

// Sidebar items come from the UI config (navigation.sidebar / sidebarBottom).
type NavItem = { id: string; label: string; icon: ReturnType<typeof navIcon>; href?: string };

const toNavItems = (items: NavItemConfig[], role?: string): NavItem[] =>
  visibleNav(items, role).map((item) => ({
    id: item.id,
    label: item.label,
    icon: navIcon(item.icon),
    href: item.href ?? undefined,
  }));

function initials(name?: string, email?: string) {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function NavRow({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const base = cn(
    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
    active
      ? 'bg-primary/15 text-primary'
      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
    !item.href && 'cursor-default opacity-70 hover:bg-transparent hover:text-muted-foreground'
  );
  const inner = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </>
  );
  if (item.href) {
    return (
      <Link href={item.href} className={base} title={collapsed ? item.label : undefined}>
        {inner}
      </Link>
    );
  }
  return (
    <span className={base} title={collapsed ? item.label : undefined}>
      {inner}
    </span>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => setMobileNavOpen(false), [pathname]);
  const [push, setPush] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => setPush(pushState()), []);

  const togglePush = async () => {
    if (push === 'unsupported' || push === 'unconfigured' || push === 'denied') return;
    setPushBusy(true);
    try {
      if (push === 'on') {
        await disablePush();
        setPush(pushState());
      } else {
        setPush(await enablePush());
      }
    } catch (e) {
      console.error('Push registration failed:', e);
      setPush(pushState());
    } finally {
      setPushBusy(false);
    }
  };

  const pushTitle = {
    unsupported: 'Notifications are not supported in this browser',
    unconfigured: 'Push notifications are not configured',
    denied: 'Notifications are blocked — allow them in your browser settings',
    off: 'Turn on notifications',
    on: 'Notifications on — click to turn off',
  }[push];


  const logout = async () => {
    setLoggingOut(true);
    try {
      // stop pushing to this browser before the session (and the token's owner) goes away
      await disablePush();
      await usersApi.logout();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      router.push('/login');
    }
  };

  const { navigation } = useUiConfig();
  const nav = toNavItems(navigation.sidebar, user?.role);
  const navBottom = toNavItems(navigation.sidebarBottom, user?.role);

  // the most specific link wins, so /admin/ui-config highlights "UI Config" and not "Admin" too
  const matches = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
  const activeHref = [...nav, ...navBottom]
    .map((item) => item.href)
    .filter((href): href is string => !!href && matches(href))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href?: string) => !!href && href === activeHref;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          'sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-white/10 bg-card/40 backdrop-blur-xl transition-[width] duration-200 md:flex',
          collapsed ? 'w-[76px]' : 'w-64'
        )}
      >
        <div className="flex h-16 items-center px-4">
          {collapsed ? <Logo href="/dashboard" withText={false} /> : <Logo href="/dashboard" />}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {nav.map((item) => (
            <NavRow key={item.id} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </nav>

        {navBottom.length ? (
          <div className="space-y-1 border-t border-white/10 px-3 py-4">
            {navBottom.map((item) => (
              <NavRow key={item.id} item={item} active={isActive(item.href)} collapsed={collapsed} />
            ))}
          </div>
        ) : null}
      </aside>

      {/* Mobile navigation */}
      <SheetPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetPrimitive.Portal>
          <SheetPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden" />
          <SheetPrimitive.Content className="ui-sheet fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[hsl(240_8%_7%)] outline-none md:hidden">
            <SheetPrimitive.Title className="sr-only">Navigation</SheetPrimitive.Title>
            <div className="flex h-16 items-center justify-between px-4">
              <Logo href="/dashboard" />
              <SheetPrimitive.Close className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="Close menu">
                <X className="h-4 w-4" />
              </SheetPrimitive.Close>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
              {[...nav, ...navBottom].map((item) => (
                <NavRow key={item.id} item={item} active={isActive(item.href)} collapsed={false} />
              ))}
            </nav>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      </SheetPrimitive.Root>

      {/* Main column */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Collapse toggle (sits on the divider) */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="absolute -left-3 top-[26px] z-40 hidden h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-card text-muted-foreground shadow transition-colors hover:text-foreground md:flex"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>

        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/10 bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:text-foreground md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <Suspense fallback={<div className="hidden max-w-md flex-1 sm:block" />}>
            <SearchBox />
          </Suspense>
          <Link
            href="/explore"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:text-foreground sm:hidden"
            aria-label="Search courses"
          >
            <Search className="h-[18px] w-[18px]" />
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={togglePush}
              disabled={pushBusy}
              aria-pressed={push === 'on'}
              className={cn(
                'relative grid h-10 w-10 place-items-center rounded-full border border-white/10 transition-colors',
                push === 'on' ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                (push === 'unsupported' || push === 'unconfigured' || push === 'denied') && 'cursor-default opacity-60'
              )}
              title={pushTitle}
              aria-label={pushTitle}
            >
              {pushBusy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Bell className="h-[18px] w-[18px]" />}
              {push === 'on' ? <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary" /> : null}
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-2 outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Account menu"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-400 text-xs font-bold text-[#0A0A0F]">
                    {initials(user?.name, user?.email)}
                  </span>
                  <span className="hidden max-w-[140px] truncate text-sm font-medium sm:inline">
                    {user?.name || user?.email || 'Account'}
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:inline" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60">
                <div className="flex items-start justify-between gap-2 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user?.name || 'Account'}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  {user?.role ? <RoleBadge role={user.role} /> : null}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push('/orders')}>
                  <Receipt /> Purchases
                </DropdownMenuItem>
                {user?.role === 'INSTRUCTOR' || user?.role === 'ADMIN' ? (
                  <DropdownMenuItem onSelect={() => router.push('/studio')}>
                    <GraduationCap /> Studio
                  </DropdownMenuItem>
                ) : null}
                {user?.role === 'ADMIN' ? (
                  <DropdownMenuItem onSelect={() => router.push('/admin')}>
                    <ShieldCheck /> Admin console
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={logout} disabled={loggingOut}>
                  {loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />} Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/** The top bar's search: Enter opens Explore filtered by the query; "/" focuses it from anywhere. */
function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pathname === '/explore') setSearch(searchParams.get('q') ?? '');
  }, [pathname, searchParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = search.trim();
        router.push(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
      }}
      className="relative hidden max-w-md flex-1 sm:block"
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search courses"
        aria-label="Search courses"
        className="h-10 w-full rounded-full border border-white/10 bg-white/[0.03] pl-10 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
        /
      </kbd>
    </form>
  );
}
