'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Settings, Check, Loader2, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HlsLevel {
  height: number;
  width: number;
  bitrate: number;
  label: string;
}

export interface HlsPlayerProps {
  /** Master playlist URL (e.g. .m3u8) */
  src: string;
  /** Show the quality controls (gear overlay + labeled dropdown) */
  showQualitySelector?: boolean;
  /** Optional class name for the video frame */
  className?: string;
  /** Optional video element props */
  videoProps?: React.ComponentPropsWithoutRef<'video'>;
}

interface LevelOption {
  index: number; // hls level index (-1 = Auto handled separately)
  label: string;
  bitrate: number;
}

export function HlsPlayer({
  src,
  showQualitySelector = true,
  className = '',
  videoProps = {},
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<HlsLevel[]>([]);
  // What the user picked: -1 = Auto. Separate from the level actually playing.
  const [selectedLevel, setSelectedLevel] = useState<number>(-1);
  const [activeLevel, setActiveLevel] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    setLoading(true);
    setLevels([]);
    setSelectedLevel(-1);

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLoading(false);
        setLevels(
          data.levels.map((level, index) => ({
            height: level.height,
            width: level.width,
            bitrate: level.bitrate,
            label: level.height ? `${level.height}p` : `Level ${index}`,
          }))
        );
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setActiveLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(`${data.type}: ${data.details}`);
          setLoading(false);
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari: native HLS handles adaptive bitrate itself (no level control).
      video.src = src;
      setLoading(false);
    } else {
      setError('HLS is not supported in this browser');
      setLoading(false);
    }
  }, [src]);

  const handleQualityChange = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (hls) hls.currentLevel = levelIndex; // -1 = Auto (ABR)
    setSelectedLevel(levelIndex);
  };

  // High → low, keeping each level's original hls index.
  const options: LevelOption[] = levels
    .map((l, index) => ({ index, label: l.label, bitrate: l.bitrate }))
    .sort((a, b) => (levels[b.index].height || 0) - (levels[a.index].height || 0));

  const activeLabel = activeLevel >= 0 ? levels[activeLevel]?.label : undefined;
  const currentLabel =
    selectedLevel === -1
      ? `Auto${activeLabel ? ` · ${activeLabel}` : ''}`
      : levels[selectedLevel]?.label ?? 'Auto';

  const hasQuality = showQualitySelector && levels.length > 0;

  return (
    <div className="w-full">
      <div className={cn('relative aspect-video overflow-hidden bg-black', className)}>
        <video
          ref={videoRef}
          className="h-full w-full"
          controls
          playsInline
          autoPlay={false}
          {...videoProps}
        />

        {loading && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-4 text-center">
            <p className="rounded-lg border border-destructive/40 bg-destructive/15 px-3 py-2 text-sm text-destructive-foreground">
              {error}
            </p>
          </div>
        )}

        {/* YouTube-style gear overlay (top-right to avoid the native control bar) */}
        {hasQuality && (
          <QualityMenu
            options={options}
            selectedLevel={selectedLevel}
            activeLabel={activeLabel}
            onChange={handleQualityChange}
            align="right"
            trigger={(open) => (
              <span
                className={cn(
                  'grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white/90 backdrop-blur transition hover:bg-black/75',
                  open && 'bg-black/80'
                )}
                title="Quality settings"
              >
                <Settings className={cn('h-[18px] w-[18px] transition-transform', open && 'rotate-45')} />
              </span>
            )}
            className="absolute right-3 top-3 z-20"
          />
        )}
      </div>

      {/* Explicit labeled quality control below the video */}
      {hasQuality && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quality</span>
          <QualityMenu
            options={options}
            selectedLevel={selectedLevel}
            activeLabel={activeLabel}
            onChange={handleQualityChange}
            align="left"
            trigger={(open) => (
              <span
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm transition-colors hover:border-white/25',
                  open && 'border-primary/40'
                )}
              >
                {currentLabel}
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
              </span>
            )}
            className="relative"
          />
        </div>
      )}
    </div>
  );
}

function QualityMenu({
  options,
  selectedLevel,
  activeLabel,
  onChange,
  trigger,
  align,
  className,
}: {
  options: LevelOption[];
  selectedLevel: number;
  activeLabel?: string;
  onChange: (levelIndex: number) => void;
  trigger: (open: boolean) => React.ReactNode;
  align: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pick = (i: number) => {
    onChange(i);
    setOpen(false);
  };

  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Quality settings">
        {trigger(open)}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className={cn(
              'absolute z-20 mt-2 w-52 overflow-hidden rounded-xl border border-white/10 bg-popover/95 py-1 text-sm shadow-2xl backdrop-blur',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Quality
            </div>

            <QualityItem
              active={selectedLevel === -1}
              label="Auto"
              hint={selectedLevel === -1 && activeLabel ? activeLabel : undefined}
              onClick={() => pick(-1)}
            />

            {options.map((opt) => (
              <QualityItem
                key={opt.index}
                active={selectedLevel === opt.index}
                label={opt.label}
                hint={opt.bitrate ? `${Math.round(opt.bitrate / 1000)} kbps` : undefined}
                onClick={() => pick(opt.index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function QualityItem({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/5',
        active ? 'text-primary' : 'text-foreground'
      )}
    >
      <Check className={cn('h-4 w-4 shrink-0', active ? 'opacity-100' : 'opacity-0')} />
      <span className="flex-1">{label}</span>
      {hint && (
        <span className={cn('text-xs', active ? 'text-primary/70' : 'text-muted-foreground')}>{hint}</span>
      )}
    </button>
  );
}
