'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useUiConfig } from '@/lib/ui-config';

interface LogoProps {
  className?: string;
  /** Render the wordmark next to the mark. */
  withText?: boolean;
  href?: string;
}

/** An ink tile with a highlight play glyph; the config's logo wins when set. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-foreground text-highlight theater:bg-highlight theater:text-highlight-foreground', className)}>
      <svg viewBox="0 0 24 24" className="h-3 w-3 translate-x-[1px]" fill="currentColor">
        <path d="M7 4.5v15l12-7.5z" />
      </svg>
    </span>
  );
}

export function Logo({ className, withText = true, href = '/' }: LogoProps) {
  const { branding } = useUiConfig();
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-supplied URL; next/image would need its host allow-listed
        <img src={branding.logoUrl} alt={branding.appName} className="h-7 w-7 rounded-[8px] object-contain" />
      ) : (
        <BrandMark />
      )}
      {withText && (
        <span className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">
          {branding.wordmark.primary}
          {branding.wordmark.accent}
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35">
      {content}
    </Link>
  );
}
