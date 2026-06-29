'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, ShieldCheck, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { CourseCard } from '@/components/course-card';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import {
  coursesApi,
  instructorApi,
  getApiErrorMessage,
  type CourseSummary,
  type InstructorRequest,
} from '@/lib/api';

export default function DashboardPage() {
  const { user, checking } = useRequireAuth();

  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </main>
    );
  }

  const firstName = (user.name?.trim().split(/\s+/)[0] || 'there').replace(/^./, (c) => c.toUpperCase());

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Welcome, <span className="text-gradient">{firstName}</span>
        </h1>
        <p className="mt-2 text-muted-foreground">{user.email}</p>

        <div className="mt-10">
          {user.role === 'STUDENT' ? <StudentHome /> : null}
          {user.role === 'INSTRUCTOR' || user.role === 'ADMIN' ? <InstructorHome /> : null}
          {user.role === 'ADMIN' ? <AdminEntry /> : null}
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-xl font-semibold">{title}</h2>
      {action}
    </div>
  );
}

function InstructorHome() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coursesApi.mine().then(setCourses).catch(() => setCourses([])).finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <SectionHeader
        title="Your courses"
        action={
          <Link href="/courses/new">
            <Button className="gap-2"><Plus className="h-4 w-4" /> Create course</Button>
          </Link>
        }
      />
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      ) : courses.length === 0 ? (
        <p className="text-muted-foreground">No courses yet. Create your first course to start uploading videos.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} href={`/courses/${c.id}/manage`} />
          ))}
        </div>
      )}
    </section>
  );
}

function StudentHome() {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coursesApi.list().then(setCourses).catch(() => setCourses([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-12">
      <BecomeInstructor />
      <section>
        <SectionHeader title="Browse courses" />
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : courses.length === 0 ? (
          <p className="text-muted-foreground">No published courses yet. Check back soon.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} href={`/courses/${c.id}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BecomeInstructor() {
  const [request, setRequest] = useState<InstructorRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    instructorApi.myRequest().then(setRequest).catch(() => setRequest(null)).finally(() => setLoading(false));
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await instructorApi.requestAccess();
      setRequest(data.request);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Could not submit request.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <section className="rounded-xl border border-white/10 glass p-6">
      <div className="flex items-start gap-3">
        <GraduationCap className="mt-0.5 h-5 w-5 text-primary" />
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Teach on LearnSphere</h2>
          {request?.status === 'PENDING' ? (
            <p className="mt-1 text-sm text-muted-foreground">Your instructor request is pending admin review.</p>
          ) : request?.status === 'REJECTED' ? (
            <p className="mt-1 text-sm text-muted-foreground">Your previous request was declined. You can request again.</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Become an instructor to create courses and upload videos.</p>
          )}
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </div>
        {request?.status !== 'PENDING' ? (
          <Button onClick={submit} disabled={submitting} variant="outline" className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Request access
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function AdminEntry() {
  return (
    <section className="mt-12">
      <Link href="/admin">
        <Button variant="outline" className="gap-2"><ShieldCheck className="h-4 w-4" /> Admin console</Button>
      </Link>
    </section>
  );
}
