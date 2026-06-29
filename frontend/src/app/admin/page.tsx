'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Check, X, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppShell } from '@/components/app-shell';
import { RoleBadge } from '@/components/role-badge';
import { useRequireRole } from '@/hooks/useRequireAuth';
import {
  adminApi,
  getApiErrorMessage,
  type InstructorRequest,
  type AdminUser,
  type Role,
} from '@/lib/api';

const ROLES: Role[] = ['STUDENT', 'INSTRUCTOR', 'ADMIN'];

export default function AdminPage() {
  const { user, checking } = useRequireRole('ADMIN');

  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        <div>
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 px-0 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Button>
          </Link>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Admin console</h1>
        </div>
        <PendingRequests />
        <UsersTable currentUserId={user.id} />
      </div>
    </AppShell>
  );
}

function PendingRequests() {
  const [requests, setRequests] = useState<InstructorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.listInstructorRequests('PENDING').then(setRequests).catch(() => setRequests([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await (action === 'approve' ? adminApi.approveRequest(id) : adminApi.rejectRequest(id));
      load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold">Pending instructor requests</h2>
      <Card className="glass border-white/10">
        <CardContent className="space-y-3 py-6">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 rounded-lg border border-white/10 px-4 py-3">
                <div>
                  <p className="font-medium">{r.user?.name}</p>
                  <p className="text-sm text-muted-foreground">{r.user?.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => act(r.id, 'approve')} disabled={busyId === r.id} className="gap-1">
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(r.id, 'reject')} disabled={busyId === r.id} className="gap-1">
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function UsersTable({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers({ page: p, search: q || undefined });
      setUsers(res.users);
      setTotalPages(res.totalPages || 1);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const changeRole = async (id: string, role: Role) => {
    await adminApi.setUserRole(id, role);
    load(page, search);
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Users</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            load(1, search);
          }}
          className="w-64"
        >
          <Input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
      </div>

      <Card className="glass border-white/10">
        <CardContent className="py-4">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <div className="divide-y divide-white/5">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RoleBadge role={u.role} />
                    {u.id === currentUserId ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value as Role)}
                        className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r} className="bg-background">
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
