import Link from 'next/link';
import { ArrowLeft, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Shown to the course's instructor and to admins on the learner page. */
export function InstructorPreviewBar({ courseId, published }: { courseId: string; published: boolean }) {
  return (
    <div className="border-b border-primary/20 bg-highlight/50">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <p className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-primary" />
          <span className="font-medium">Instructor preview</span>
          <span className="text-muted-foreground">— this is what students see.</span>
          {published ? null : (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning ring-1 ring-warning/20">
              Draft: not in the catalogue yet
            </span>
          )}
        </p>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href={`/courses/${courseId}/manage`}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to studio
          </Link>
        </Button>
      </div>
    </div>
  );
}
