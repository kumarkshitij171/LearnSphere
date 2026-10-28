import { cn } from '@/lib/utils';

export function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function Avatar({ name, email, className }: { name?: string | null; email?: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-[12px] font-semibold text-foreground', className)}
    >
      {initials(name, email)}
    </span>
  );
}
