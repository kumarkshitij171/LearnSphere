'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { CourseCard } from '@/components/course-card';
import { PriceField, priceProblem, priceToNumber, type PriceValue } from '@/components/studio/price-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/components/ui/toaster';
import { useRequireRole } from '@/hooks/useRequireAuth';
import { coursesApi, getApiErrorMessage, type CourseSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

const TEXTAREA =
  'flex w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 transition-colors hover:border-white/20 focus-visible:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

const NEXT_STEPS = ['Add lessons — drag videos straight onto the course page', 'Preview it exactly as a student will', 'Publish when at least one lesson is ready'];

export default function NewCoursePage() {
  const { user, checking } = useRequireRole(['INSTRUCTOR', 'ADMIN']);
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState<PriceValue>({ free: false, amount: '' });
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (checking || !user) return <main className="min-h-screen bg-background" />;

  const titleProblem = title.trim().length < 3 ? 'Give your course a title of at least 3 characters.' : null;
  const descriptionProblem = description.trim().length < 10 ? 'Describe it in at least 10 characters.' : null;
  const problem = titleProblem ?? descriptionProblem ?? priceProblem(price);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    setSubmitting(true);
    setError(null);
    try {
      const course = await coursesApi.create({
        title: title.trim(),
        description: description.trim(),
        price: priceToNumber(price),
      });
      toast.success('Course created', { description: 'Now add your first lesson.' });
      router.push(`/courses/${course.id}/manage`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not create the course.'));
      setSubmitting(false);
    }
  };

  // what the course will look like in the catalogue, updated as they type
  const preview: CourseSummary = {
    id: title.trim() || 'new-course',
    title: title.trim() || 'Your course title',
    description: description.trim() || 'Your description appears here.',
    price: priceToNumber(price),
    currency: 'INR',
    isPublished: false,
    instructorId: user.id,
    instructor: { id: user.id, name: user.name || 'You', email: user.email || '' },
    _count: { videos: 0 },
    createdAt: new Date().toISOString(),
  };

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/studio" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Studio
        </Link>
        <PageHeader title="Create a course" description="Start with the basics. Everything here can be changed later." />

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <form onSubmit={submit} className="space-y-6 rounded-3xl border border-white/[0.08] bg-card/40 p-5 sm:p-7" noValidate>
            <label className="block space-y-2">
              <span className="flex items-center justify-between text-sm font-medium">
                Title <span className="text-xs font-normal tabular-nums text-muted-foreground">{title.length}/150</span>
              </span>
              <Input
                value={title}
                maxLength={150}
                autoFocus
                placeholder="e.g. Kafka from zero to production"
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={touched && Boolean(titleProblem)}
                className={cn(touched && titleProblem && 'border-red-500/50')}
              />
              {touched && titleProblem ? <span className="text-xs text-red-300">{titleProblem}</span> : null}
            </label>

            <label className="block space-y-2">
              <span className="flex items-center justify-between text-sm font-medium">
                Description <span className="text-xs font-normal tabular-nums text-muted-foreground">{description.length}/5000</span>
              </span>
              <textarea
                value={description}
                maxLength={5000}
                rows={6}
                placeholder="What will students be able to do after this course? Who is it for?"
                onChange={(e) => setDescription(e.target.value)}
                aria-invalid={touched && Boolean(descriptionProblem)}
                className={cn(TEXTAREA, touched && descriptionProblem && 'border-red-500/50')}
              />
              {touched && descriptionProblem ? (
                <span className="text-xs text-red-300">{descriptionProblem}</span>
              ) : (
                <span className="text-xs text-muted-foreground">Two or three sentences help students decide.</span>
              )}
            </label>

            <PriceField value={price} onChange={setPrice} disabled={submitting} />

            {error ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/20">{error}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
              <p className="text-xs text-muted-foreground">It starts as a draft — only you can see it until you publish.</p>
              <Button type="submit" disabled={submitting} className="gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create course
              </Button>
            </div>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Preview in the catalogue</p>
            <div className="pointer-events-none">
              <CourseCard course={preview} href="#" />
            </div>
            <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-card/40 p-5">
              <p className="text-sm font-semibold">After this</p>
              <ul className="space-y-2.5">
                {NEXT_STEPS.map((step) => (
                  <li key={step} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {step}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
