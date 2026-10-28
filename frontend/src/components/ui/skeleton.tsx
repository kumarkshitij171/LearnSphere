import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('rounded-lg bg-surface motion-safe:animate-pulse', className)} />;
}
