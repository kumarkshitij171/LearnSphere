import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  PlayCircle,
  BarChart3,
  Users,
  Award,
  Sparkles,
  Check,
  Zap,
  ShieldCheck,
  Star,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand';

const features = [
  {
    icon: BookOpen,
    title: 'Rich course library',
    desc: 'Build structured courses with chapters, lessons and downloadable resources in minutes.',
  },
  {
    icon: PlayCircle,
    title: 'Adaptive video player',
    desc: 'Stream lessons smoothly at any connection with built-in HLS transcoding.',
  },
  {
    icon: BarChart3,
    title: 'Progress analytics',
    desc: 'Track completion, engagement and quiz performance with real-time dashboards.',
  },
  {
    icon: Users,
    title: 'Cohorts & teams',
    desc: 'Group learners, assign paths and manage permissions across your organization.',
  },
  {
    icon: Award,
    title: 'Verifiable certificates',
    desc: 'Reward learners with shareable certificates the moment they finish a course.',
  },
  {
    icon: Zap,
    title: 'Smart recommendations',
    desc: 'Surface the next best lesson for every learner with personalized suggestions.',
  },
];

const stats = [
  { value: '50K+', label: 'Active learners' },
  { value: '1,200+', label: 'Courses published' },
  { value: '98%', label: 'Completion rate' },
  { value: '4.9/5', label: 'Average rating' },
];

const steps = [
  {
    n: '01',
    title: 'Create your space',
    desc: 'Spin up a branded academy in minutes — no setup, no infrastructure to manage.',
  },
  {
    n: '02',
    title: 'Build your courses',
    desc: 'Drag in videos, docs and quizzes. Organize them into paths your learners love.',
  },
  {
    n: '03',
    title: 'Grow & measure',
    desc: 'Invite cohorts, watch engagement climb, and issue certificates automatically.',
  },
];

const heroChips = [
  { icon: Users, value: '50K+', label: 'learners onboarded' },
  { icon: PlayCircle, value: '4.2M', label: 'lessons streamed' },
  { icon: Award, value: '120K', label: 'certificates issued' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Logo />
          <div className="hidden items-center gap-9 text-sm font-medium text-muted-foreground md:flex">
            <Link href="#features" className="transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="#stats" className="transition-colors hover:text-foreground">
              Why LearnSphere
            </Link>
            <Link href="#how" className="transition-colors hover:text-foreground">
              How it works
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="gap-1.5">
              <Link href="/signup">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* layered background */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-spotlight" />
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-32 top-10 h-80 w-80 rounded-full bg-lime-300/10 blur-3xl animate-blob" />
          <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl animate-blob animation-delay-2000" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-lime-300/[0.07] blur-3xl animate-blob animation-delay-4000" />
        </div>
        {/* fade to canvas at bottom */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-background" />

        <div className="mx-auto max-w-4xl px-5 pb-24 pt-20 text-center sm:pt-28">
          <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            The learning platform for modern teams
          </span>

          <h1 className="animate-fade-up animation-delay-200 mx-auto mt-7 max-w-3xl font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
            Learn without limits.{' '}
            <span className="text-gradient">Teach without friction.</span>
          </h1>

          <p className="animate-fade-up animation-delay-200 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            LearnSphere unifies courses, adaptive video, analytics and certificates
            into one beautifully fast workspace — so you can focus on what matters:
            helping people grow.
          </p>

          <div className="animate-fade-up animation-delay-400 mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="gap-2 text-base">
              <Link href="/signup">
                Create free account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-base">
              <Link href="/login">Log in</Link>
            </Button>
          </div>

          <p className="animate-fade-up animation-delay-400 mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            No credit card required · Free forever for individuals
          </p>
        </div>

        {/* Product mockup — glass dashboard card */}
        <div className="animate-fade-up animation-delay-600 mx-auto -mb-px max-w-5xl px-5">
          <div className="glass glow-primary relative rounded-t-2xl p-2 sm:p-3">
            <div className="rounded-xl border border-white/10 bg-background/60">
              {/* window chrome */}
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-white/15" />
                <span className="h-3 w-3 rounded-full bg-white/15" />
                <span className="h-3 w-3 rounded-full bg-white/15" />
                <div className="ml-3 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5 text-primary" />
                  app.learnsphere.io
                </div>
              </div>
              {/* faux dashboard body */}
              <div className="grid gap-4 p-5 sm:grid-cols-3">
                {heroChips.map((chip) => (
                  <div
                    key={chip.label}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left"
                  >
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                      <chip.icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="mt-3 font-display text-2xl font-bold tracking-tight">
                      {chip.value}
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      {chip.label}
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:col-span-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Weekly engagement
                    </span>
                    <span className="font-mono text-xs text-primary">+18.4%</span>
                  </div>
                  <div className="flex h-24 items-end gap-2">
                    {[38, 52, 44, 66, 58, 78, 92].map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-t-md bg-gradient-to-t from-lime-300/20 to-emerald-400/60"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats band */}
      <section id="stats" className="border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-5 py-14 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                {s.value}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-5 py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-primary">
            Features
          </span>
          <h2 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Everything you need to{' '}
            <span className="text-gradient">learn and teach</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            A complete toolkit built for creators, educators and ambitious learners.
          </p>
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:bg-white/[0.04] hover:shadow-[0_12px_40px_-12px_hsl(83_78%_55%/0.25)]"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 transition-colors group-hover:bg-primary/15">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative overflow-hidden border-y border-white/10">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-spotlight opacity-60" />
        <div className="mx-auto max-w-7xl px-5 py-28">
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-mono text-xs uppercase tracking-widest text-primary">
              How it works
            </span>
            <h2 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Live in three steps
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From empty workspace to thriving academy — without the busywork.
            </p>
          </div>

          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <div
                key={s.n}
                className="glass relative rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30"
              >
                <span className="font-mono text-sm font-semibold text-primary">
                  {s.n}
                </span>
                <h3 className="mt-4 font-display text-xl font-semibold tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <figure className="glass mx-auto mt-12 max-w-3xl rounded-2xl p-8 text-center">
            <div className="flex justify-center gap-1 text-primary">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-current" />
              ))}
            </div>
            <blockquote className="mt-5 font-display text-xl font-medium leading-relaxed tracking-tight text-foreground sm:text-2xl">
              “We moved our entire onboarding to LearnSphere and completion rates
              jumped from 61% to 94% in a single quarter.”
            </blockquote>
            <figcaption className="mt-5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Maya Chen</span> · Head of
              People Development, Northwind
            </figcaption>
          </figure>
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-7xl px-5 py-28">
        <div className="glass glow-primary relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-16 sm:py-20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime-300/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
          <h2 className="relative mx-auto max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Ready to start your{' '}
            <span className="text-gradient">learning journey?</span>
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Join thousands of learners and creators already growing with LearnSphere.
          </p>
          <div className="relative mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" asChild className="gap-2 text-base">
              <Link href="/signup">
                Get started for free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-primary" /> Set up in under 2 minutes
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row">
          <Logo href={undefined} />
          <div className="flex items-center gap-7 text-sm text-muted-foreground">
            <Link href="#features" className="transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="#how" className="transition-colors hover:text-foreground">
              How it works
            </Link>
            <Link href="/login" className="transition-colors hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-foreground">
              Get started
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 LearnSphere</p>
        </div>
      </footer>
    </div>
  );
}
