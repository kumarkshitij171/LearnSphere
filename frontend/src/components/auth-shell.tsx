import { Logo } from '@/components/brand';
import { Quote, Check } from 'lucide-react';

interface AuthShellProps {
  children: React.ReactNode;
}

const highlights = [
  'Expert-led courses across 40+ categories',
  'Track progress with real-time analytics',
  'Earn verifiable certificates',
];

/**
 * Split-screen auth layout: a dark brand panel on the left (hidden on small
 * screens) and the form slot on the right.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <div className="relative hidden w-[45%] overflow-hidden border-r border-white/10 bg-grid lg:flex lg:flex-col lg:justify-between lg:p-12 xl:w-1/2">
        <div className="pointer-events-none absolute inset-0 bg-spotlight" />
        <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-primary/15 blur-3xl animate-blob" />
        <div className="pointer-events-none absolute bottom-10 right-0 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl animate-blob animation-delay-2000" />

        <div className="relative">
          <Logo />
        </div>

        <div className="relative space-y-8">
          <h2 className="max-w-md font-display text-4xl font-bold leading-[1.1] tracking-tight text-foreground">
            The smarter way to{' '}
            <span className="text-gradient">learn, teach and grow.</span>
          </h2>
          <ul className="space-y-3.5">
            {highlights.map((h) => (
              <li key={h} className="flex items-center gap-3 text-muted-foreground">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                {h}
              </li>
            ))}
          </ul>

          <figure className="glass max-w-md rounded-2xl p-6">
            <Quote className="h-6 w-6 text-primary" />
            <blockquote className="mt-3 text-sm leading-relaxed text-foreground/90">
              “LearnSphere completely changed how our team upskills. Beautiful,
              fast, and our learners actually finish their courses.”
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-400 text-sm font-bold text-[#0A0A0F]">
                P
              </span>
              <span className="text-sm">
                <span className="block font-medium text-foreground">Priya Sharma</span>
                <span className="block text-muted-foreground">Head of L&amp;D, Northwind</span>
              </span>
            </figcaption>
          </figure>
        </div>

        <p className="relative text-sm text-muted-foreground">
          © {new Date().getFullYear()} LearnSphere. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex w-full flex-col justify-center px-4 py-12 lg:w-[55%] lg:px-12 xl:w-1/2">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40 lg:hidden" />
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
