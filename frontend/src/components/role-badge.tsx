import { cn } from '@/lib/utils';
import type { Role } from '@/lib/api';

const styles: Record<Role, string> = {
  STUDENT: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
  INSTRUCTOR: 'bg-lime-400/10 text-lime-300 border-lime-400/20',
  ADMIN: 'bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-400/20',
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize',
        styles[role],
        className
      )}
    >
      {role.toLowerCase()}
    </span>
  );
}
