'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  BookOpen,
  Bookmark,
  ClipboardList,
  Compass,
  Award,
  Receipt,
  HelpCircle,
  Settings,
  Search,
  Bell,
  ChevronDown,
  ChevronLeft,
  ShieldCheck,
  LogOut,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/brand';
import { RoleBadge } from '@/components/role-badge';
import { usersApi, type CurrentUser } from '@/lib/api';

type NavItem = { label: string; icon: typeof LayoutDashboard; href?: string };

const NAV: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'My Courses', icon: BookOpen, href: '/dashboard' },
  { label: 'Saved Courses', icon: Bookmark },
  { label: 'Report', icon: ClipboardList },
  { label: 'Explore Course', icon: Compass },
  { label: 'Certificate', icon: Award },
  { label: 'Transaction', icon: Receipt },
];

const NAV_BOTTOM: NavItem[] = [
  { label: 'Help Center', icon: HelpCircle },
  { label: 'Settings', icon: Settings },
];

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const isActive = (href?: string) =>
    !!href && (pathname === href || (href !== '/dashboard' && pathname.startsWith(href)));

  const logout = async () => {
    setLoggingOut(true);
    try {
      await usersApi.logout();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      router.push('/login');
    }
  };

  const nav = [...NAV];
  if (user?.role === 'ADMIN') nav.push({ label: 'Admin', icon: ShieldCheck, href: '/admin' });

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
            <NavRow key={item.label} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-4">
          {NAV_BOTTOM.map((item) => (
            <NavRow key={item.label} item={item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>
      </aside>

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
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-white/10 bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Try search programing course"
              className="h-10 w-full rounded-full border border-white/10 bg-white/[0.03] pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </div>

          <div className="ml-auto flex items-center gap-3">
            <button
              className="relative grid h-10 w-10 place-items-center rounded-full border border-white/10 text-muted-foreground transition-colors hover:text-foreground"
              title="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary" />
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
                className="flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-2 transition-colors hover:bg-white/5"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-400 text-xs font-bold text-[#0A0A0F]">
                  {initials(user?.name, user?.email)}
                </span>
                <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">
                  {user?.name || user?.email || 'Account'}
                </span>
                <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:inline" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-white/10 bg-popover p-2 shadow-xl">
                  <div className="flex items-center justify-between gap-2 px-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user?.name || 'Account'}</p>
                      <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>
                  {user?.role && (
                    <div className="px-2 pb-2">
                      <RoleBadge role={user.role} />
                    </div>
                  )}
                  <button
                    onClick={logout}
                    disabled={loggingOut}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    {loggingOut ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
