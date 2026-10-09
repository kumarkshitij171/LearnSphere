import { cn } from '@/lib/utils';

// Curated pairs that sit well on the dark palette; picked by a stable hash of the course id, so a
// course keeps its cover and neighbouring courses look different.
const PALETTES: Array<[string, string]> = [
  ['#a3e635', '#059669'],
  ['#818cf8', '#4c1d95'],
  ['#f59e0b', '#be123c'],
  ['#38bdf8', '#1e3a8a'],
  ['#e879f9', '#6d28d9'],
  ['#2dd4bf', '#3f6212'],
  ['#fb7185', '#7c2d12'],
  ['#facc15', '#15803d'],
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function monogram(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

/** Generated cover art until instructors can upload a thumbnail. */
export function CourseCover({
  id,
  title,
  className,
  size = 'md',
  children,
}: {
  id: string;
  title: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}) {
  const h = hash(id);
  const [from, to] = PALETTES[h % PALETTES.length]!;
  const angle = 115 + (h % 50);
  return (
    <div
      className={cn('relative isolate overflow-hidden bg-neutral-900', className)}
      style={{ backgroundImage: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)` }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 15%, rgba(255,255,255,0.55), transparent 45%), radial-gradient(circle at 85% 90%, rgba(0,0,0,0.6), transparent 50%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.18]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '14px 14px' }}
      />
      <span
        className={cn(
          'absolute bottom-[-0.12em] right-[0.08em] select-none font-display font-bold leading-none tracking-tighter text-white/25',
          size === 'sm' && 'text-5xl',
          size === 'md' && 'text-7xl',
          size === 'lg' && 'text-9xl'
        )}
      >
        {monogram(title)}
      </span>
      {children}
    </div>
  );
}
