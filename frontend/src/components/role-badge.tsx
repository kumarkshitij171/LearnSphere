import { Badge } from '@/components/ui/badge';
import type { Role } from '@/lib/api';

const tones = { STUDENT: 'neutral', INSTRUCTOR: 'info', ADMIN: 'warning' } as const;

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge tone={tones[role]} className={className}>
      <span className="capitalize">{role.toLowerCase()}</span>
    </Badge>
  );
}
