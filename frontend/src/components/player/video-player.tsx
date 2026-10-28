'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  Captions,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  RotateCcw,
  Settings,
  SkipBack,
  SkipForward,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CenterFeedback, type Chip, type Flash, type Ripple } from './center-feedback';
import { ControlButton, Pill } from './control-button';
import { loadPrefs, savePrefs } from './prefs';
import { ProgressBar } from './progress-bar';
import { SettingsMenu } from './settings-menu';
import { actionForKey, isTypingTarget, stepRate, type PlayerAction } from './shortcuts';
import { formatTime } from './time';
import { useHls } from './use-hls';
import { useMedia } from './use-media';
import { UpNext } from './up-next';
import { VolumeControl } from './volume-control';

export interface PlayerNeighbour {
  title: string;
  onPlay: () => void;
  /** shown on the Up next card */
  thumbnail?: React.ReactNode;
}

export interface VideoPlayerProps {
  /** master playlist URL */
  src: string;
  /** shown over the video in fullscreen */
  title?: string;
  previous?: PlayerNeighbour | null;
  next?: PlayerNeighbour | null;
  theater?: boolean;
  /** the page owns the layout; without a handler the theater button is hidden */
  onTheaterChange?: (on: boolean) => void;
  autoPlay?: boolean;
  /** 'global' listens on the whole page (one main player); 'focus' only while the player has focus */
  shortcuts?: 'global' | 'focus';
  /** caps the player's height so a 9:16 video does not run off the screen */
  maxHeightVh?: number;
  onEnded?: () => void;
  /** resume here (seconds) when the video loads */
  startAt?: number | null;
  /** called every few seconds while playing, on pause and at the end */
  onProgress?: (position: number, duration: number, ended: boolean) => void;
  /** count down and play `next` when this lesson ends */
  autoAdvance?: boolean;
  className?: string;
}

const IDLE_MS = 2500;
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type IosVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

export function VideoPlayer({
  src,
  title,
  previous,
  next,
  theater,
  onTheaterChange,
  autoPlay,
  shortcuts = 'focus',
  maxHeightVh = 78,
  onEnded,
  startAt,
  onProgress,
  autoAdvance = true,
  className,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [prefs] = useState(loadPrefs);
  const hls = useHls(videoRef, src, prefs.quality);
  const media = useMedia(videoRef, src);
  const { state } = media;

  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [idle, setIdle] = useState(false);
  // keyboard focus on a control keeps the controls up; a mouse click on the video does not
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const [compact, setCompact] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [ripple, setRipple] = useState<Ripple | null>(null);
  const [chip, setChip] = useState<Chip | null>(null);
  const [hasCaptions, setHasCaptions] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const counter = useRef(0);
  const lastTap = useRef<{ t: number; x: number } | null>(null);
  // only the position at mount matters; startAt keeps changing as progress is saved
  const initialStart = useRef(startAt ?? null);
  const resumeAt = useRef<number | null>(initialStart.current);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const nextId = () => ++counter.current;

  // ---- preferences: restore on every new source, remember what the viewer changes ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const apply = () => {
      v.volume = prefs.volume;
      v.muted = prefs.muted;
      v.defaultPlaybackRate = prefs.rate;
      v.playbackRate = prefs.rate;
      if (resumeAt.current !== null) {
        v.currentTime = resumeAt.current;
        if (resumeAt.current === initialStart.current) setResumedFrom(initialStart.current);
        resumeAt.current = null;
      }
      if (autoPlay) v.play().catch(() => undefined);
    };
    v.addEventListener('loadedmetadata', apply, { once: true });
    return () => v.removeEventListener('loadedmetadata', apply);
  }, [src, prefs, autoPlay, hls.generation]);

  useEffect(() => {
    if (state.started) savePrefs({ volume: state.volume, muted: state.muted, rate: state.rate });
  }, [state.volume, state.muted, state.rate, state.started]);

  useEffect(() => {
    if (state.ended) onEnded?.();
    if (!state.ended) setUpNextDismissed(false);
  }, [state.ended, onEnded]);

  // progress: every 5 s while playing, and whenever playback stops
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const report = (ended = false) => {
      if (v.duration > 0) progressRef.current?.(v.currentTime, v.duration, ended);
    };
    const onPause = () => report();
    const onEnd = () => report(true);
    const timer = setInterval(() => !v.paused && report(), 5000);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnd);
    window.addEventListener('pagehide', onPause);
    return () => {
      report();
      clearInterval(timer);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnd);
      window.removeEventListener('pagehide', onPause);
    };
  }, [src]);

  // the "Resumed at" pill goes away on its own
  useEffect(() => {
    if (resumedFrom === null) return;
    const t = setTimeout(() => setResumedFrom(null), 6000);
    return () => clearTimeout(t);
  }, [resumedFrom]);

  // ---- captions: shown only when the video actually has a text track ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setHasCaptions(Array.from(v.textTracks).some((t) => t.kind === 'subtitles' || t.kind === 'captions'));
    v.textTracks.addEventListener('addtrack', update);
    update();
    return () => v.textTracks.removeEventListener('addtrack', update);
  }, [src]);

  const toggleCaptions = () => {
    const v = videoRef.current;
    if (!v) return;
    const on = !captionsOn;
    for (const t of Array.from(v.textTracks)) {
      if (t.kind === 'subtitles' || t.kind === 'captions') t.mode = on ? 'showing' : 'hidden';
    }
    setCaptionsOn(on);
  };

  // ---- fullscreen + picture-in-picture ----
  useEffect(() => {
    const doc = document as FullscreenDoc;
    const onChange = () => setFullscreen((doc.fullscreenElement ?? doc.webkitFullscreenElement) === containerRef.current);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const doc = document as FullscreenDoc;
    const el = containerRef.current as FullscreenEl | null;
    if (!el) return;
    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
      (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
    } else if (el.requestFullscreen) {
      // the whole player goes fullscreen — controls and the settings menu included
      el.requestFullscreen().catch(() => undefined);
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else {
      // iPhone: only the system player can go fullscreen; it brings its own controls
      (videoRef.current as IosVideo | null)?.webkitEnterFullscreen?.();
    }
  }, []);

  const pipSupported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on = () => setPip(true);
    const off = () => setPip(false);
    v.addEventListener('enterpictureinpicture', on);
    v.addEventListener('leavepictureinpicture', off);
    return () => {
      v.removeEventListener('enterpictureinpicture', on);
      v.removeEventListener('leavepictureinpicture', off);
    };
  }, []);
  const togglePip = useCallback(() => {
    const v = videoRef.current;
    if (!v || !pipSupported) return;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => undefined);
    else v.requestPictureInPicture().catch(() => undefined);
  }, [pipSupported]);

  // ---- auto-hide ----
  const poke = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  useEffect(() => {
    if (!state.paused) poke();
  }, [state.paused, poke]);
  const controlsVisible = state.paused || !state.started || menuOpen || scrubbing || !idle || keyboardFocus || Boolean(hls.error);

  // ---- compact layout for small players (the instructor's list, phones) ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setCompact((entry?.contentRect.width ?? 999) < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- actions ----
  const togglePlay = useCallback(
    (withFlash = true) => {
      const willPlay = state.paused || state.ended;
      media.toggle();
      if (withFlash && state.started) setFlash({ id: nextId(), kind: willPlay ? 'play' : 'pause' });
    },
    [media, state.paused, state.ended, state.started]
  );

  const seekBy = useCallback(
    (seconds: number) => {
      media.seekBy(seconds);
      setRipple({ id: nextId(), direction: seconds < 0 ? -1 : 1, seconds: Math.abs(seconds) });
      poke();
    },
    [media, poke]
  );

  const setLevel = useCallback(
    (index: number) => {
      hls.setLevel(index);
      const level = hls.levels.find((l) => l.index === index);
      savePrefs({ quality: index === -1 || !level ? 'auto' : level.short });
    },
    [hls]
  );

  const run = useCallback(
    (action: PlayerAction) => {
      const v = videoRef.current;
      switch (action.type) {
        case 'toggle':
          return togglePlay();
        case 'seekBy':
          return seekBy(action.seconds);
        case 'volumeBy': {
          const vol = Math.min(1, Math.max(0, (state.muted ? 0 : state.volume) + action.delta));
          media.setVolume(vol);
          if (v && vol > 0) v.muted = false;
          return setChip({ id: nextId(), text: `${Math.round(vol * 100)}%` });
        }
        case 'mute':
          media.toggleMute();
          return setChip({ id: nextId(), text: state.muted ? 'Sound on' : 'Muted' });
        case 'fullscreen':
          return toggleFullscreen();
        case 'theater':
          return onTheaterChange?.(!theater);
        case 'pip':
          return togglePip();
        case 'seekPercent':
          return media.seek((state.duration * action.percent) / 100);
        case 'rateStep': {
          const r = stepRate(state.rate, action.direction);
          media.setRate(r);
          return setChip({ id: nextId(), text: r === 1 ? 'Normal speed' : `${r}×` });
        }
        case 'seekTo':
          return media.seek(action.position === 'start' ? 0 : state.duration);
      }
    },
    [togglePlay, seekBy, media, state.muted, state.volume, state.duration, state.rate, toggleFullscreen, onTheaterChange, theater, togglePip]
  );

  const onKey = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const action = actionForKey(e);
      if (!action) return;
      const target = e.target as HTMLElement | null;
      const inPlayer = Boolean(target && containerRef.current?.contains(target));
      if (inPlayer && (e.key === ' ' || e.key === 'Enter') && target?.closest('button, input, [role="slider"]')) return;
      // Space/Enter on a focused button elsewhere on the page belongs to that button
      if (!inPlayer && target && target !== document.body && target.closest('button, a, [role="button"], summary')) return;
      e.preventDefault();
      run(action);
      poke();
    },
    [run, poke]
  );

  useEffect(() => {
    if (shortcuts !== 'global') return;
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [shortcuts, onKey]);

  // ---- surface gestures: click toggles, double-click goes fullscreen, double-tap seeks ----
  const onSurfacePointerUp = (e: ReactPointerEvent<HTMLVideoElement>) => {
    if (e.pointerType !== 'touch') return;
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const prev = lastTap.current;
    if (prev && now - prev.t < 300 && Math.abs(prev.x - x) < 0.15 && (x < 1 / 3 || x > 2 / 3)) {
      seekBy(x < 1 / 3 ? -10 : 10);
      lastTap.current = null;
      return;
    }
    lastTap.current = { t: now, x };
    if (controlsVisible && state.started && !state.paused) setIdle(true);
    else poke();
  };

  const retry = () => {
    resumeAt.current = videoRef.current?.currentTime || null;
    hls.retry();
  };

  const ratio = state.videoWidth && state.videoHeight ? state.videoWidth / state.videoHeight : 16 / 9;
  const portrait = ratio < 1;

  return (
    <div className={cn('flex w-full justify-center', className)}>
      <div
        ref={containerRef}
        data-look="theater"
        tabIndex={0}
        aria-label={title ? `Video player: ${title}` : 'Video player'}
        onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
        onPointerLeave={() => state.started && !state.paused && setIdle(true)}
        onKeyDown={shortcuts === 'focus' ? onKey : undefined}
        onFocus={(e) => setKeyboardFocus(e.target !== e.currentTarget && (e.target as HTMLElement).matches(':focus-visible'))}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setKeyboardFocus(false)}
        onPointerDown={() => setKeyboardFocus(false)}
        className={cn(
          'group/player relative isolate select-none overflow-hidden bg-black text-white outline-none',
          fullscreen ? 'rounded-none' : 'rounded-2xl ring-1 ring-white/10',
          !controlsVisible && 'cursor-none'
        )}
        style={
          fullscreen
            ? undefined
            : { aspectRatio: String(ratio), width: `min(100%, calc(${maxHeightVh}vh * ${ratio}))` }
        }
        data-portrait={portrait || undefined}
      >
        <video
          ref={videoRef}
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          onClick={(e) => {
            if (menuOpen) return setMenuOpen(false);
            if ((e.nativeEvent as PointerEvent).pointerType === 'touch') return;
            containerRef.current?.focus({ preventScroll: true });
            togglePlay();
          }}
          onDoubleClick={toggleFullscreen}
          onPointerUp={onSurfacePointerUp}
        />

        {fullscreen && title ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-6 pb-12 pt-5 transition-opacity duration-300',
              controlsVisible ? 'opacity-100' : 'opacity-0'
            )}
          >
            <p className="truncate text-lg font-semibold drop-shadow">{title}</p>
          </div>
        ) : null}

        <CenterFeedback
          started={state.started}
          ended={state.ended}
          waiting={state.waiting}
          flash={flash}
          ripple={ripple}
          chip={chip}
          onPlay={() => (state.ended ? (media.seek(0), media.play()) : media.play())}
        />

        {resumedFrom !== null && state.started ? (
          <div className="player-pop absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/60 py-1.5 pl-3.5 pr-1.5 text-sm text-white ring-1 ring-white/10 backdrop-blur-md">
            Resumed at <span className="font-semibold tabular-nums">{formatTime(resumedFrom)}</span>
            <button
              type="button"
              onClick={() => {
                media.seek(0);
                setResumedFrom(null);
              }}
              className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
            >
              Start over
            </button>
          </div>
        ) : null}

        {state.ended && next && autoAdvance && !upNextDismissed ? (
          <UpNext title={next.title} thumbnail={next.thumbnail} onPlay={next.onPlay} onCancel={() => setUpNextDismissed(true)} />
        ) : null}

        {hls.error ? (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/80 p-6 text-center">
            <div className="flex max-w-sm flex-col items-center gap-3">
              <TriangleAlert className="h-8 w-8 text-amber-300" />
              <p className="text-sm text-white/85">{hls.error}</p>
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight"
              >
                <RotateCcw className="h-4 w-4" /> Try again
              </button>
            </div>
          </div>
        ) : null}

        {/* bottom gradient + controls */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300',
            controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
          <div className={cn('relative', compact ? 'px-2.5 pb-2' : 'px-4 pb-3')}>
            <ProgressBar
              currentTime={state.currentTime}
              duration={state.duration}
              bufferedEnd={state.bufferedEnd}
              onSeek={media.seek}
              onScrubChange={setScrubbing}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Pill>
                  <ControlButton
                    label={state.paused || state.ended ? 'Play' : 'Pause'}
                    shortcut="k"
                    tooltipAlign="start"
                    onClick={() => togglePlay(false)}
                  >
                    {state.paused || state.ended ? <Play className="ml-0.5 h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
                  </ControlButton>
                </Pill>

                {(previous || next) && !compact ? (
                  <Pill>
                    <ControlButton label={previous ? `Previous: ${previous.title}` : 'No previous lesson'} disabled={!previous} onClick={previous?.onPlay} className="disabled:opacity-40">
                      <SkipBack className="h-5 w-5 fill-current" />
                    </ControlButton>
                    <ControlButton label={next ? `Next: ${next.title}` : 'No next lesson'} disabled={!next} onClick={next?.onPlay} className="disabled:opacity-40">
                      <SkipForward className="h-5 w-5 fill-current" />
                    </ControlButton>
                  </Pill>
                ) : null}

                <Pill>
                  <VolumeControl
                    volume={state.volume}
                    muted={state.muted}
                    onVolume={media.setVolume}
                    onToggleMute={media.toggleMute}
                    compact={compact}
                  />
                </Pill>

                <Pill className="h-11 px-4">
                  <span className="whitespace-nowrap text-[13px] font-medium tabular-nums tracking-tight text-white/95">
                    {formatTime(state.currentTime)}
                    <span className="text-white/50"> / {formatTime(state.duration)}</span>
                  </span>
                </Pill>
              </div>

              <Pill className="shrink-0">
                {hasCaptions ? (
                  <ControlButton label={captionsOn ? 'Turn off captions' : 'Captions'} shortcut="c" pressed={captionsOn} onClick={toggleCaptions}>
                    <Captions className={cn('h-5 w-5', captionsOn && 'text-highlight')} />
                  </ControlButton>
                ) : null}
                <div className="relative">
                  <ControlButton
                    label="Settings"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuOpen((o) => !o)}
                  >
                    <Settings className={cn('h-5 w-5 transition-transform duration-300', menuOpen && 'rotate-45')} />
                  </ControlButton>
                  {menuOpen ? (
                    <SettingsMenu
                      rate={state.rate}
                      onRate={media.setRate}
                      levels={hls.levels}
                      selected={hls.selected}
                      active={hls.active}
                      onLevel={setLevel}
                      qualityAvailable={!hls.native}
                      onClose={() => setMenuOpen(false)}
                    />
                  ) : null}
                </div>
                {pipSupported && !compact ? (
                  <ControlButton label={pip ? 'Exit picture-in-picture' : 'Picture-in-picture'} shortcut="i" pressed={pip} onClick={togglePip}>
                    <PictureInPicture2 className="h-5 w-5" />
                  </ControlButton>
                ) : null}
                {onTheaterChange && !compact && !fullscreen ? (
                  <ControlButton label={theater ? 'Default view' : 'Theater mode'} shortcut="t" pressed={theater} onClick={() => onTheaterChange(!theater)}>
                    <RectangleHorizontal className={cn('h-5 w-5', theater && 'scale-x-125')} />
                  </ControlButton>
                ) : null}
                <ControlButton label={fullscreen ? 'Exit full screen' : 'Full screen'} shortcut="f" tooltipAlign="end" onClick={toggleFullscreen}>
                  {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </ControlButton>
              </Pill>
            </div>
          </div>
        </div>

        {menuOpen ? (
          // clicking anywhere outside the menu closes it without pausing the lesson
          <div className="absolute inset-0 z-10" onPointerDown={() => setMenuOpen(false)} />
        ) : null}
      </div>
    </div>
  );
}

