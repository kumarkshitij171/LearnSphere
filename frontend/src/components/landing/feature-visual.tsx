import type { NavIconName } from '@/lib/ui-config';

// Small, true pictures of a feature, chosen by the item's icon; items without one stay text-only.
export const hasFeatureVisual = (icon: NavIconName) => icon === 'MonitorPlay' || icon === 'History' || icon === 'Keyboard';

export function FeatureVisual({ icon }: { icon: NavIconName }) {
  if (icon === 'MonitorPlay') {
    const rungs = [
      ['2160p', '100%'],
      ['1440p', '78%'],
      ['1080p', '60%'],
      ['720p', '44%'],
      ['480p', '30%'],
    ];
    return (
      <div className="space-y-1.5" aria-hidden>
        {rungs.map(([label, w], i) => (
          <div key={label} className="flex items-center gap-3">
            <span className="w-11 font-mono text-[11px] text-muted-foreground">{label}</span>
            <span className={`h-2 rounded-full ${i === 2 ? 'bg-highlight shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.12)]' : 'bg-foreground/15'}`} style={{ width: w }} />
          </div>
        ))}
      </div>
    );
  }
  if (icon === 'History') {
    return (
      <div className="space-y-2.5" aria-hidden>
        <span className="inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background">
          Resumed at <span className="font-mono">7:42</span>
        </span>
        <div className="relative h-1.5 rounded-full bg-foreground/10">
          <span className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-foreground" />
        </div>
      </div>
    );
  }
  if (icon === 'Keyboard') {
    return (
      <div className="flex flex-wrap gap-1.5" aria-hidden>
        {['J', 'K', 'L', 'F', 'T', 'M'].map((k) => (
          <span
            key={k}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border border-b-[3px] bg-background font-mono text-sm font-medium"
          >
            {k}
          </span>
        ))}
      </div>
    );
  }
  return null;
}
