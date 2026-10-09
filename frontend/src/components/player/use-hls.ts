'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import Hls from 'hls.js';

export interface QualityLevel {
  /** hls.js level index */
  index: number;
  width: number;
  height: number;
  /** the number viewers know a quality by ("1080p"): the short side, so a 1080x1920 phone video is 1080p */
  short: number;
  bitrate: number;
  frameRate?: number;
}

export interface HlsState {
  /** renditions, highest first */
  levels: QualityLevel[];
  /** what the viewer picked; -1 = Auto */
  selected: number;
  /** what is actually playing (useful as "Auto (720p)") */
  active: number;
  setLevel: (index: number) => void;
  /** a fatal error the player could not recover from */
  error: string | null;
  retry: () => void;
  /** Safari/iOS play HLS natively and choose quality themselves */
  native: boolean;
  /** bumps on every (re)attach, so callers can re-apply state after a retry */
  generation: number;
}

/**
 * Attaches an HLS stream to a <video>. hls.js where supported (every desktop browser), the
 * native player on Safari. Network and media errors get one automatic recovery each before the
 * viewer sees an error.
 */
export function useHls(videoRef: RefObject<HTMLVideoElement>, src: string, preferredHeight: number | 'auto'): HlsState {
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selected, setSelected] = useState(-1);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [native, setNative] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // read once per source: changing the preference mid-stream is done through setLevel
  const preferred = useRef(preferredHeight);
  preferred.current = preferredHeight;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setError(null);
    setLevels([]);
    setSelected(-1);
    setActive(-1);

    if (Hls.isSupported()) {
      setNative(false);
      const hls = new Hls({ enableWorker: true, capLevelToPlayerSize: true });
      hlsRef.current = hls;
      let recoveredNetwork = false;
      let recoveredMedia = false;

      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        const list = data.levels
          .map((l, index) => ({
            index,
            width: l.width,
            height: l.height,
            short: Math.min(l.width, l.height) || l.height,
            bitrate: l.bitrate,
            frameRate: l.frameRate || undefined,
          }))
          .sort((a, b) => b.short - a.short || b.bitrate - a.bitrate);
        setLevels(list);
        const want = preferred.current;
        if (want !== 'auto') {
          // the closest rendition at or below the preference; never silently jump above it
          const pick = list.find((l) => l.short <= want) ?? list[list.length - 1];
          if (pick) {
            hls.currentLevel = pick.index;
            setSelected(pick.index);
          }
        }
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setActive(data.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !recoveredNetwork) {
          recoveredNetwork = true;
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
          recoveredMedia = true;
          hls.recoverMediaError();
          return;
        }
        // the detail is for developers; the viewer gets a sentence
        console.error('[player] unrecoverable HLS error', data.type, data.details);
        setError(
          data.type === Hls.ErrorTypes.NETWORK_ERROR
            ? "This video can't be loaded right now. Check your connection and try again."
            : "This video can't be played right now."
        );
      });

      hls.loadSource(src);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      setNative(true);
      video.src = src;
      const onError = () => setError("This video can't be played right now.");
      video.addEventListener('error', onError);
      return () => {
        video.removeEventListener('error', onError);
        video.removeAttribute('src');
        video.load();
      };
    }

    setError("Your browser can't play this video. Try a recent version of Chrome, Firefox, Edge or Safari.");
  }, [videoRef, src, attempt]);

  const setLevel = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (hls) hls.currentLevel = index;
    setSelected(index);
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { levels, selected, active, setLevel, error, retry, native, generation: attempt };
}
