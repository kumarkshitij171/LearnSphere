import { Check } from 'lucide-react';

// An illustration of the course page drawn in markup: the dark player beside the lesson list.
const LESSONS: Array<{ title: string; length: string; state: 'done' | 'now' | 'next' }> = [
  { title: 'Why a log, not a queue', length: '9:12', state: 'done' },
  { title: 'Topics and partitions', length: '14:30', state: 'done' },
  { title: 'Producers and acks', length: '16:04', state: 'done' },
  { title: 'Consumer groups and rebalancing', length: '18:05', state: 'now' },
  { title: 'Offsets and exactly-once', length: '21:47', state: 'next' },
  { title: 'The outbox pattern', length: '12:58', state: 'next' },
];

const CODE = [
  ['34%', '#c792ea'],
  ['58%', '#82aaff'],
  ['46%', '#c3e88d'],
  ['70%', '#82aaff'],
  ['28%', '#f78c6c'],
  ['52%', '#c3e88d'],
] as const;

export function ProductFrame() {
  return (
    <div aria-hidden className="mx-auto max-w-[1100px] rounded-t-[22px] bg-surface px-2.5 pt-2.5 sm:px-3.5 sm:pt-3.5">
      <div className="overflow-hidden rounded-t-[14px] border border-b-0 border-border bg-background">
        <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="ml-3 truncate rounded-md bg-surface px-3 py-1 font-mono text-[11.5px] text-muted-foreground">learnsphere/courses/kafka</span>
        </div>
        <div className="grid md:grid-cols-[minmax(0,1fr)_300px]">
          <div data-look="theater" className="relative p-3 sm:p-4">
            <div className="flex aspect-video flex-col justify-center gap-[6%] rounded-md bg-[#1c1e23] px-[9%]">
              {CODE.map(([w, c], i) => (
                <span key={i} className="block h-[5%] min-h-[4px] rounded-sm opacity-90" style={{ width: w, background: c }} />
              ))}
            </div>
            <div className="absolute inset-x-6 bottom-6 space-y-2 sm:inset-x-8 sm:bottom-8">
              <div className="relative h-1 rounded-full bg-white/25">
                <span className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-highlight" />
                <span className="absolute left-[42%] top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
              </div>
              <div className="flex items-center justify-between font-mono text-[11px] text-white/85">
                <span>7:42 / 18:05</span>
                <span className="hidden items-center gap-1 sm:flex">
                  {['J', 'K', 'L'].map((k) => (
                    <span key={k} className="rounded border border-white/30 px-1.5 py-0.5 text-[10px]">
                      {k}
                    </span>
                  ))}
                  <span className="ml-1.5">1080p · auto</span>
                </span>
              </div>
            </div>
          </div>
          <div className="hidden border-l border-border p-3 md:block">
            <p className="flex items-baseline justify-between px-2 pb-2 pt-1 text-[13px] font-semibold">
              Distributed Systems with Kafka <span className="font-mono text-xs font-normal text-muted-foreground">4 / 12</span>
            </p>
            <ul className="space-y-0.5">
              {LESSONS.map((l, i) => (
                <li
                  key={l.title}
                  className={`grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-[7px] text-[13px] ${l.state === 'now' ? 'bg-surface font-medium' : ''}`}
                >
                  <span className="font-mono text-[11.5px] text-muted-foreground">
                    {l.state === 'done' ? <Check className="h-3.5 w-3.5 text-success" /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{l.title}</span>
                  <span className="font-mono text-[11.5px] text-muted-foreground">{l.length}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
