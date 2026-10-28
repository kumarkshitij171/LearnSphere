'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import {
  ChevronsLeft,
  ChevronsUpDown,
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
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand';
import { RoleBadge } from '@/components/role-badge';
import { CommandSearch } from '@/components/command-search';
import { ThemeSegmented, ThemeToggleButton } from '@/components/theme-toggle';
import { PushToasts } from '@/components/push-toasts';
import { NotificationInbox } from '@/components/notification-inbox';
import { usersApi, type CurrentUser } from '@/lib/api';
import { navIcon, useUiConfig, visibleNav, type NavItemConfig } from '@/lib/ui-config';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';

// Sidebar items come from the UI config (navigation.sidebar / sidebarBottom).
type NavItem = { id: string; label: string; icon: ReturnType<typeof navIcon>; href?: string };

const COLLAPSED_KEY = 'learnsphere.sidebar.collapsed';

const toNavItems = (items: NavItemConfig[], role?: string): NavItem[] =>
  visibleNav(items, role).map((item) => ({
    id: item.id,
    label: item.label,
    icon: navIcon(item.icon),
    href: item.href ?? undefined,
  }));

function NavRow({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const base = cn(
    'group relative flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
    collapsed && 'justify-center px-0',
    active
      ? 'bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--border)),0_1px_2px_rgb(17_17_19/0.04)]'
      : 'text-body hover:bg-foreground/[0.05] hover:text-foreground',
    !item.href && 'cursor-default opacity-60 hover:bg-transparent'
  );
  const inner = (
    <>
      <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {active ? (
        <span
          aria-hidden
          className={cn('h-1.5 w-1.5 rounded-[2px] bg-highlight shadow-[0_0_0_1px_hsl(var(--foreground)/0.15)]', collapsed ? 'absolute right-1.5 top-1.5' : 'ml-auto')}
        />
      ) : null}
    </>
  );
  if (item.href) {
    return (
      <Link href={item.href} className={base} title={collapsed ? item.label : undefined} aria-current={active ? 'page' : undefined}>
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

export function AppShell({ user, children }: { user: CurrentUser | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [push, setPush] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => setMobileNavOpen(false), [pathname]);
  useEffect(() => setPush(pushState()), []);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // a preference, not state
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1');
      } catch {
        // a preference, not state
      }
      return !c;
    });
  };

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
  const matches = (href: string) => pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
  const activeHref = [...nav, ...navBottom]
    .map((item) => item.href)
    .filter((href): href is string => !!href && matches(href))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href?: string) => !!href && href === activeHref;

  const commandLinks = [...nav, ...navBottom]
    .filter((i): i is NavItem & { href: string } => !!i.href)
    .map((i) => ({ id: i.id, label: i.label, href: i.href, icon: i.icon }));

  const accountMenu = (trigger: React.ReactNode, side: 'top' | 'bottom') => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" side={side} align={side === 'top' ? 'start' : 'end'}>
        <div className="flex items-start justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name || 'Account'}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          {user?.role ? <RoleBadge role={user.role} /> : null}
        </div>
        <div className="px-1.5 pb-1.5 pt-0.5">
          <ThemeSegmented />
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
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <PushToasts state={push} />
      {/* Sidebar */}
      <aside
        className={cn(
          'sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-border bg-surface/40 transition-[width] duration-200 md:flex',
          collapsed ? 'w-[68px]' : 'w-[232px]'
        )}
      >
        <div className={cn('flex h-14 items-center', collapsed ? 'justify-center' : 'px-4')}>
          <Logo href="/dashboard" withText={!collapsed} />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Main">
          {nav.map((item) => (
            <NavRow key={item.id} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
          {navBottom.length ? (
            <div className="mt-3 space-y-0.5 border-t border-border pt-3">
              {navBottom.map((item) => (
                <NavRow key={item.id} item={item} active={isActive(item.href)} collapsed={collapsed} />
              ))}
            </div>
          ) : null}
        </nav>

        <div className="space-y-1 border-t border-border p-3">
          {accountMenu(
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 rounded-[10px] p-1.5 text-left outline-none transition-colors hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-ring/35',
                collapsed && 'justify-center'
              )}
              aria-label="Account menu"
            >
              <Avatar name={user?.name} email={user?.email} />
              {!collapsed ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{user?.name || user?.email || 'Account'}</span>
                    <span className="block truncate text-xs capitalize text-muted-foreground">{user?.role?.toLowerCase()}</span>
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </>
              ) : null}
            </button>,
            'top'
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              'flex h-8 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35',
              collapsed && 'justify-center px-0'
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronsLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
            {!collapsed ? 'Collapse' : null}
          </button>
        </div>
      </aside>

      {/* Mobile navigation */}
      <SheetPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetPrimitive.Portal>
          <SheetPrimitive.Overlay className="ui-overlay fixed inset-0 z-50 bg-black/30 md:hidden" />
          <SheetPrimitive.Content className="ui-sheet fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background outline-none md:hidden">
            <SheetPrimitive.Title className="sr-only">Navigation</SheetPrimitive.Title>
            <div className="flex h-14 items-center justify-between px-4">
              <Logo href="/dashboard" />
              <SheetPrimitive.Close
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </SheetPrimitive.Close>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
              {[...nav, ...navBottom].map((item) => (
                <NavRow key={item.id} item={item} active={isActive(item.href)} collapsed={false} />
              ))}
            </nav>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      </SheetPrimitive.Root>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background px-4 sm:px-6 lg:px-9">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-full text-body transition-colors hover:bg-surface hover:text-foreground md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <span className="md:hidden">
            <Logo href="/dashboard" withText={false} />
          </span>
          <CommandSearch links={commandLinks} className="ml-auto w-9 justify-center px-0 sm:ml-0 sm:w-[360px] sm:justify-start sm:px-3" />

          <div className="ml-1 flex items-center gap-1 sm:ml-auto">
            <ThemeToggleButton />
            <NotificationInbox push={push} pushBusy={pushBusy} pushTitle={pushTitle} onTogglePush={togglePush} />
            <span className="md:hidden">
              {accountMenu(
                <button type="button" className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/35" aria-label="Account menu">
                  <Avatar name={user?.name} email={user?.email} />
                </button>,
                'bottom'
              )}
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
