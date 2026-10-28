'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toaster';
import { adminApi, getApiErrorMessage, type AdminUser, type Role } from '@/lib/api';
import { relativeTime } from '@/lib/format';

const ROLE_LABEL: Record<Role, string> = { STUDENT: 'Student', INSTRUCTOR: 'Instructor', ADMIN: 'Admin' };

function initials(name: string, email: string) {
  const src = (name || email).trim();
  const parts = src.split(/\s+/);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : src.slice(0, 2)).toUpperCase();
}

export function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await adminApi.listUsers({ page, search: query || undefined });
      setUsers(res.users);
      setTotalPages(res.totalPages || 1);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not load users.'));
      setUsers([]);
    }
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQuery(search.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const changeRole = async (user: AdminUser, role: Role) => {
    if (role === user.role) return;
    const ok = await confirm({
      title: `Make ${user.name || user.email} ${ROLE_LABEL[role].toLowerCase() === 'admin' ? 'an admin' : `a${role === 'INSTRUCTOR' ? 'n' : ''} ${ROLE_LABEL[role].toLowerCase()}`}?`,
      description:
        role === 'ADMIN'
          ? 'Admins can manage every user, course and order, and edit the UI configuration.'
          : role === 'INSTRUCTOR'
            ? 'They will be able to create courses and upload lessons.'
            : 'They will keep the courses they bought, but lose access to the studio.',
      confirmLabel: 'Change role',
      tone: role === 'ADMIN' ? 'danger' : 'default',
      action: async () => {
        await adminApi.setUserRole(user.id, role).catch((e) => {
          throw new Error(getApiErrorMessage(e, 'Could not change the role.'));
        });
      },
    });
    if (!ok) return;
    toast.success('Role updated', { description: 'It takes effect the next time their session refreshes (within 5 minutes).' });
    load();
  };

  return (
    <section className="space-y-4">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email"
          aria-label="Search users"
          className="h-10 w-full rounded-xl border border-border bg-foreground/[0.03] pl-9 pr-3 text-sm placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
        />
      </label>

      {users === null ? (
        <Skeleton className="h-64 w-full rounded-[14px]" />
      ) : error ? (
        <EmptyState icon={<Users />} title="Users are unavailable" description={error} action={<Button variant="outline" onClick={load}>Try again</Button>} />
      ) : users.length === 0 ? (
        <EmptyState icon={<Users />} title="No users match" description={query ? `Nothing for “${query}”.` : undefined} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[14px] border border-border">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.02]">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-xs font-semibold text-foreground">
                {initials(u.name, u.email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {u.name || 'Unnamed'}
                  {u.id === currentUserId ? <Badge>You</Badge> : null}
                  {!u.isVerified ? <Badge tone="warning">Unverified</Badge> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {u.email} · joined {relativeTime(u.createdAt)}
                </p>
              </div>
              {u.id === currentUserId ? (
                <Badge tone="primary">{ROLE_LABEL[u.role]}</Badge>
              ) : (
                <select
                  value={u.role}
                  onChange={(e) => changeRole(u, e.target.value as Role)}
                  aria-label={`Role for ${u.email}`}
                  className="h-9 rounded-lg border border-border bg-foreground/[0.03] px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
                >
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                    <option key={r} value={r} className="bg-background">
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
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
      ) : null}
    </section>
  );
}
