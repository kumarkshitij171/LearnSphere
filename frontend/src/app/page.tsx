import { Fragment } from 'react';
import Link from 'next/link';
import { ArrowRight, Bookmark, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { TwoTone } from '@/components/ui/two-tone';
import { Logo } from '@/components/brand';
import { ThemeToggleButton } from '@/components/theme-toggle';
import { Faq } from '@/components/landing/faq';
import { FeatureVisual, hasFeatureVisual } from '@/components/landing/feature-visual';
import { ProductFrame } from '@/components/landing/product-frame';
import { loadUiConfig } from '@/lib/ui-config/server';
import { navIcon, type HomeSectionType } from '@/lib/ui-config';

export default async function LandingPage() {
  const { config } = await loadUiConfig();
  const { hero, features, howItWorks, faq, finalCta } = config.home;

  const sectionLinks: Array<{ href: string; label: string; type: HomeSectionType }> = [
    { href: '#features', label: features.eyebrow || 'Features', type: 'features' },
    { href: '#teach', label: 'Teach', type: 'howItWorks' },
    { href: '#faq', label: 'Questions', type: 'faq' },
  ];
  const enabled = new Set(config.home.sections.filter((s) => s.enabled).map((s) => s.type));

  // Sections below the hero, in the order and with the toggles the UI config sets.
  const blocks: Record<HomeSectionType, JSX.Element> = {
    features: (
      <section id="features" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-24 sm:py-28">
        <div className="max-w-2xl space-y-4">
          {features.eyebrow ? <p className="text-[15px] text-muted-foreground">{features.eyebrow}</p> : null}
          <TwoTone lead={features.heading.title} trail={features.heading.titleHighlight} breakLine className="text-display-l" />
        </div>
        <div className="mt-12 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {features.items.map((item) => {
            const Icon = navIcon(item.icon);
            const visual = hasFeatureVisual(item.icon);
            return (
              <article key={item.title} className={`flex flex-col justify-between gap-8 rounded-panel bg-surface p-6 ${visual ? 'min-h-[248px]' : ''}`}>
                {visual ? <FeatureVisual icon={item.icon} /> : null}
                <div className="space-y-2">
                  <h3 className="flex items-center gap-2.5 text-heading">
                    <Icon className="h-[18px] w-[18px] text-muted-foreground" />
                    {item.title}
                  </h3>
                  <p className="text-[14.5px] leading-relaxed text-body">{item.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    ),
    howItWorks: (
      <section id="teach" className="scroll-mt-20 border-y border-border">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-24 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-6">
            {howItWorks.eyebrow ? <p className="text-[15px] text-muted-foreground">{howItWorks.eyebrow}</p> : null}
            <TwoTone lead={howItWorks.heading.title} trail={howItWorks.heading.titleHighlight} breakLine className="text-display-l" />
            <Button asChild variant="outline" size="lg">
              <Link href="/signup">
                Start teaching <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {howItWorks.steps.map((step, i) => (
              <li key={step.title} className="grid grid-cols-[44px_minmax(0,1fr)] gap-4 py-7">
                <span className="font-mono text-[13px] text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                <div className="space-y-1.5">
                  <h3 className="text-title">{step.title}</h3>
                  <p className="max-w-prose text-[15px] leading-relaxed text-body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    ),
    faq: (
      <section id="faq" className="mx-auto grid max-w-[1200px] scroll-mt-20 gap-10 px-5 py-24 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <TwoTone lead={faq.heading.title} trail={faq.heading.titleHighlight || undefined} breakLine className="text-display-l" />
        <Faq items={faq.items} />
      </section>
    ),
    finalCta: (
      <section className="mx-auto max-w-[1200px] px-5 pb-24">
        <div className="flex flex-col items-center gap-6 rounded-panel bg-surface px-6 py-16 text-center sm:py-20">
          <TwoTone lead={finalCta.heading.title} trail={finalCta.heading.titleHighlight} breakLine className="text-display-l" />
          {finalCta.body ? <p className="max-w-md text-lead text-body">{finalCta.body}</p> : null}
          <Button asChild size="lg">
            <Link href={finalCta.ctaHref}>
              {finalCta.ctaLabel} <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    ),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <nav className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-5" aria-label="Main">
          <Logo />
          <div className="hidden items-center gap-7 text-sm text-body md:flex">
            <Link href="/explore" className="transition-colors hover:text-foreground">
              Courses
            </Link>
            {sectionLinks
              .filter((l) => enabled.has(l.type))
              .map((l) => (
                <Link key={l.href} href={l.href} className="transition-colors hover:text-foreground">
                  {l.label}
                </Link>
              ))}
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggleButton />
            <Button variant="ghost" asChild className="hidden sm:inline-flex">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </nav>
      </header>

      <section className="px-5 pb-0 pt-16 sm:pt-24">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center">
          {hero.eyebrow ? <p className="text-[15px] text-muted-foreground">{hero.eyebrow}</p> : null}
          <h1 className="text-display-xl text-balance">
            {hero.title}{' '}
            <IconTile>
              <Play />
            </IconTile>
            {hero.titleHighlight ? (
              <>
                <br />
                <span className="text-subtle">
                  <IconTile tone="highlight">
                    <Bookmark />
                  </IconTile>{' '}
                  {hero.titleHighlight}
                </span>
              </>
            ) : null}
          </h1>
          {hero.subtitle ? <p className="max-w-[580px] text-lead text-body">{hero.subtitle}</p> : null}
          <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row">
            <Button asChild size="lg">
              <Link href={hero.ctaHref}>
                {hero.ctaLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {hero.secondaryLabel ? (
              <Button asChild size="lg" variant="ghost">
                <Link href={hero.secondaryHref}>{hero.secondaryLabel}</Link>
              </Button>
            ) : null}
          </div>
          {hero.footnote ? <p className="font-mono text-[12.5px] text-muted-foreground">{hero.footnote}</p> : null}
        </div>
        <div className="mt-14 sm:mt-16">
          <ProductFrame />
        </div>
      </section>

      <div className="border-t border-border">
        {config.home.sections
          .filter((section) => section.enabled && blocks[section.type])
          .map((section) => (
            <Fragment key={section.type}>{blocks[section.type]}</Fragment>
          ))}
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-5 py-10 sm:flex-row sm:items-center">
          <Logo href={undefined} />
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-sm text-body">
            <Link href="/explore" className="transition-colors hover:text-foreground">
              Courses
            </Link>
            {enabled.has('faq') ? (
              <Link href="#faq" className="transition-colors hover:text-foreground">
                Questions
              </Link>
            ) : null}
            <Link href="/login" className="transition-colors hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="transition-colors hover:text-foreground">
              Create account
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {config.branding.appName}
            {config.branding.supportEmail ? ` · ${config.branding.supportEmail}` : ''}
          </p>
        </div>
      </footer>
    </div>
  );
}
