import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  /** Render the wordmark next to the icon. */
  withText?: boolean;
  href?: string;
}

export function Logo({ className, withText = true, href = '/' }: LogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-lime-300 to-emerald-400 text-[#0A0A0F] shadow-[0_0_20px_-4px_hsl(83_78%_55%/0.6)]">
        <GraduationCap className="h-5 w-5" strokeWidth={2.5} />
      </span>
      {withText && (
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          Learn<span className="text-primary">Sphere</span>
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="inline-flex items-center transition-opacity hover:opacity-90">
      {content}
    </Link>
  );
}
