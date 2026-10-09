'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, Layers, Plus, Radio, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CourseCard, CourseGrid } from '@/components/course-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { useRequireRole } from '@/hooks/useRequireAuth';
import { coursesApi, type CourseSummary } from '@/lib/api';

export default function StudioPage() {
  const { user, checking } = useRequireRole(['INSTRUCTOR', 'ADMIN']);
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);

  useEffect(() => {
    if (!user) return;
    coursesApi.mine().then(setCourses).catch(() => setCourses([]));
  }, [user]);

  if (checking || !user) return <main className="min-h-screen bg-background" />;

  const live = courses?.filter((c) => c.isPublished).length ?? 0;
  const students = courses?.reduce((s, c) => s + (c._count?.enrollments ?? 0), 0) ?? 0;
  const lessons = courses?.reduce((s, c) => s + (c._count?.videos ?? 0), 0) ?? 0;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Studio"
          title="Your courses"
          description="Build lessons, preview them as a student, and publish when they're ready."
          actions={
            <Button asChild className="gap-2">
              <Link href="/courses/new">
                <Plus className="h-4 w-4" /> Create course
              </Link>
            </Button>
          }
        />

        {courses === null ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : courses.length ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Courses" value={courses.length} icon={<GraduationCap />} />
              <StatCard label="Live" value={live} hint={courses.length - live ? `${courses.length - live} in draft` : 'All published'} icon={<Radio />} />
              <StatCard label="Students" value={students} icon={<Users />} />
              <StatCard label="Lessons" value={lessons} icon={<Layers />} />
            </div>
            <CourseGrid>
              {courses.map((c) => (
                <CourseCard key={c.id} course={c} href={`/courses/${c.id}/manage`} variant="studio" />
              ))}
            </CourseGrid>
          </>
        ) : (
          <EmptyState
            icon={<GraduationCap />}
            title="Create your first course"
            description="Give it a title and a price, then add lessons. You can keep it as a draft until it's ready."
            action={
              <Button asChild className="gap-2">
                <Link href="/courses/new">
                  <Plus className="h-4 w-4" /> Create course
                </Link>
              </Button>
            }
            className="py-20"
          />
        )}
      </div>
    </AppShell>
  );
}
