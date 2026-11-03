'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Compass, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CourseRows, learningRows } from '@/components/dashboard/course-rows';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { coursesApi, type CourseSummary, type CurrentUser } from '@/lib/api';
import { loadProgress, type ProgressMap } from '@/lib/progress';

export default function MyCoursesPage() {
  const { user, checking } = useRequireAuth();
  if (checking || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  return (
    <AppShell user={user}>
      <MyCourses user={user} />
    </AppShell>
  );
}

function MyCourses({ user }: { user: CurrentUser }) {
  const [enrolled, setEnrolled] = useState<CourseSummary[] | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});

  useEffect(() => {
    setProgress(loadProgress(user.id));
    coursesApi.enrolled().then(setEnrolled).catch(() => setEnrolled([]));
  }, [user.id]);

  const rows = useMemo(() => learningRows(enrolled ?? [], progress), [enrolled, progress]);
  const inProgress = rows
    .filter((r) => !(r.total > 0 && r.done >= r.total))
    .sort((a, b) => (b.lastWatched ?? 0) - (a.lastWatched ?? 0));
  const completed = rows.filter((r) => r.total > 0 && r.done >= r.total);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 pb-16 pt-8 sm:px-6 lg:px-9">
      <PageHeader
        title="My courses"
        description={enrolled ? `${enrolled.length} ${enrolled.length === 1 ? 'course' : 'courses'} you can watch.` : ' '}
        actions={
          <Button asChild variant="outline">
            <Link href="/explore">Find more courses</Link>
          </Button>
        }
      />

      {enrolled === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-[14px]" />
          ))}
        </div>
      ) : enrolled.length === 0 ? (
        <EmptyState
          icon={<Compass />}
          title="You haven't started a course yet"
          description="Courses you enrol in or buy appear here."
          action={
            <Button asChild>
              <Link href="/explore">Explore courses</Link>
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue={inProgress.length ? 'progress' : 'completed'}>
          <TabsList>
            <TabsTrigger value="progress">
              In progress <span className="font-mono text-xs text-muted-foreground">{inProgress.length}</span>
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed <span className="font-mono text-xs text-muted-foreground">{completed.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="progress" className="mt-4">
            {inProgress.length ? <CourseRows rows={inProgress} /> : <p className="text-sm text-muted-foreground">Everything you started is finished.</p>}
          </TabsContent>
          <TabsContent value="completed" className="mt-4">
            {completed.length ? <CourseRows rows={completed} /> : <p className="text-sm text-muted-foreground">Finished courses appear here.</p>}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
