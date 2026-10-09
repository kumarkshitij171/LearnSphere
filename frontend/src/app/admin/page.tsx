'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, GraduationCap, Inbox, Receipt, SlidersHorizontal, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CoursesPanel } from '@/components/admin/courses-panel';
import { OrdersPanel } from '@/components/admin/orders-panel';
import { RequestsPanel } from '@/components/admin/requests-panel';
import { UsersPanel } from '@/components/admin/users-panel';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRequireRole } from '@/hooks/useRequireAuth';
import { adminApi, adminOrdersApi } from '@/lib/api';

const TABS = ['overview', 'users', 'courses', 'orders', 'requests'] as const;
type Tab = (typeof TABS)[number];

interface Overview {
  users: number;
  instructors: number;
  live: number;
  drafts: number;
  students: number;
  paidOrders: number;
}

function AdminConsole() {
  const { user, checking } = useRequireRole('ADMIN');
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview';
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      adminApi.listUsers({ limit: 1 }).catch(() => null),
      adminApi.listUsers({ limit: 1, role: 'INSTRUCTOR' }).catch(() => null),
      adminApi.listCourses().catch(() => []),
      adminOrdersApi.list({ status: 'PAID', size: 1 }).catch(() => null),
      adminApi.listInstructorRequests('PENDING').catch(() => []),
    ]).then(([all, instructors, courses, paid, requests]) => {
      setOverview({
        users: all?.total ?? 0,
        instructors: instructors?.total ?? 0,
        live: courses.filter((c) => c.isPublished).length,
        drafts: courses.filter((c) => !c.isPublished).length,
        students: courses.reduce((s, c) => s + (c._count?.enrollments ?? 0), 0),
        paidOrders: paid?.total ?? 0,
      });
      setPending(requests.length);
    });
  }, [user]);

  const onPendingChange = useCallback((n: number) => setPending(n), []);
  const go = (next: string) => router.replace(next === 'overview' ? '/admin' : `/admin?tab=${next}`, { scroll: false });

  if (checking || !user) return <main className="min-h-screen bg-background" />;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Admin" title="Console" description="People, courses and payments across LearnSphere." />

        <Tabs value={tab} onValueChange={go}>
          <TabsList className="overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="requests">
              Instructor requests
              {pending ? <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-bold text-primary-foreground">{pending}</span> : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 pt-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Users" value={overview?.users ?? '—'} hint={overview ? `${overview.instructors} instructors` : undefined} icon={<Users />} />
              <StatCard label="Live courses" value={overview?.live ?? '—'} hint={overview ? `${overview.drafts} in draft` : undefined} icon={<GraduationCap />} />
              <StatCard label="Enrolments" value={overview?.students ?? '—'} hint="active students across courses" icon={<Users />} />
              <StatCard label="Paid orders" value={overview?.paidOrders ?? '—'} icon={<Receipt />} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => go('requests')}
                className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-card/40 p-5 text-left transition-colors hover:border-white/20"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Inbox className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">Instructor requests</span>
                  <span className="block text-sm text-muted-foreground">
                    {pending === null ? 'Loading…' : pending ? `${pending} waiting for review` : 'Nothing waiting'}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
              <Link
                href="/admin/ui-config"
                className="group flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-primary/[0.08] to-card/40 p-5 transition-colors hover:border-primary/40"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <SlidersHorizontal className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">UI configuration</span>
                  <span className="block text-sm text-muted-foreground">Branding, theme, navigation and copy — diff and publish without a deploy.</span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </TabsContent>
          <TabsContent value="users" className="pt-6">
            <UsersPanel currentUserId={user.id} />
          </TabsContent>
          <TabsContent value="courses" className="pt-6">
            <CoursesPanel />
          </TabsContent>
          <TabsContent value="orders" className="pt-6">
            <OrdersPanel />
          </TabsContent>
          <TabsContent value="requests" className="pt-6">
            <RequestsPanel onChange={onPendingChange} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminConsole />
    </Suspense>
  );
}
