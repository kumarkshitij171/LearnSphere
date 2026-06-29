'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlayCircle, Users } from 'lucide-react';
import type { CourseSummary } from '@/lib/api';

export function CourseCard({ course, href }: { course: CourseSummary; href: string }) {
  return (
    <Link href={href} className="group block">
      <Card className="glass h-full border-white/10 transition-colors group-hover:border-white/25">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg">{course.title}</CardTitle>
            {!course.isPublished ? (
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Draft
              </span>
            ) : null}
          </div>
          <CardDescription className="line-clamp-2">{course.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <PlayCircle className="h-4 w-4" />
            {course._count?.videos ?? 0} videos
          </span>
          {course._count?.enrollments != null ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {course._count.enrollments}
            </span>
          ) : (
            <span className="font-medium text-foreground">
              {course.price > 0 ? `$${course.price}` : 'Free'}
            </span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
