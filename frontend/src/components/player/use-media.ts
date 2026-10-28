'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

export interface MediaState {
  paused: boolean;
  /** has playback started at least once (hides the big play button) */
  started: boolean;
  ended: boolean;
  /** stalled for data */
  waiting: boolean;
  currentTime: number;
  duration: number;
  /** end of the buffered range around the playhead */
  bufferedEnd: number;
  volume: number;
  muted: boolean;
  rate: number;
  /** intrinsic size, for sizing the player to the video's own shape */
  videoWidth: number;
  videoHeight: number;
}

const INITIAL: MediaState = {
  paused: true,
  started: false,
  ended: false,
  waiting: false,
  currentTime: 0,
  duration: 0,
  bufferedEnd: 0,
  volume: 1,
  muted: false,
  rate: 1,
  videoWidth: 0,
  videoHeight: 0,
};

function bufferedEndAt(video: HTMLVideoElement): number {
  const t = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= t + 0.5 && video.buffered.end(i) >= t) return video.buffered.end(i);
  }
  return t;
}

/** Media state read from <video> events, plus the actions that change it. */
export function useMedia(videoRef: RefObject<HTMLVideoElement>, src: string) {
  const [state, setState] = useState<MediaState>(INITIAL);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setState((s) => ({ ...INITIAL, volume: s.volume, muted: s.muted, rate: s.rate }));

    const sync = () =>
      setState((s) => ({
        ...s,
        paused: v.paused,
        ended: v.ended,
        currentTime: v.currentTime,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
        bufferedEnd: bufferedEndAt(v),
        volume: v.volume,
        muted: v.muted,
        rate: v.playbackRate,
        videoWidth: v.videoWidth || s.videoWidth,
        videoHeight: v.videoHeight || s.videoHeight,
      }));

    let frame = 0;
    const tick = () => {
      setState((s) => (s.currentTime === v.currentTime ? s : { ...s, currentTime: v.currentTime }));
      frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setState((s) => ({ ...s, started: true }));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
      sync();
    };
    const onPause = () => {
      cancelAnimationFrame(frame);
      sync();
    };
    const onWaiting = () => setState((s) => ({ ...s, waiting: true }));
    const onPlaying = () => setState((s) => ({ ...s, waiting: false, started: true }));
    const onCanPlay = () => setState((s) => ({ ...s, waiting: false }));

    const events: Array<[string, () => void]> = [
      ['play', onPlay],
      ['pause', onPause],
      ['ended', onPause],
      ['waiting', onWaiting],
      ['playing', onPlaying],
      ['canplay', onCanPlay],
      ['seeked', sync],
      ['timeupdate', sync],
      ['progress', sync],
      ['durationchange', sync],
      ['loadedmetadata', sync],
      ['resize', sync],
      ['volumechange', sync],
      ['ratechange', sync],
    ];
    for (const [name, fn] of events) v.addEventListener(name, fn);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      for (const [name, fn] of events) v.removeEventListener(name, fn);
    };
  }, [videoRef, src]);

  const play = useCallback(() => {
    // autoplay policies can refuse; the big play button stays as the way in
    videoRef.current?.play().catch(() => undefined);
  }, [videoRef]);
  const pause = useCallback(() => videoRef.current?.pause(), [videoRef]);
  const toggle = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) v.play().catch(() => undefined);
    else v.pause();
  }, [videoRef]);
  const seek = useCallback(
    (t: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(v.duration)) return;
      v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
      setState((s) => ({ ...s, currentTime: v.currentTime }));
    },
    [videoRef]
  );
  const seekBy = useCallback((d: number) => seek((videoRef.current?.currentTime ?? 0) + d), [seek, videoRef]);
  const setVolume = useCallback(
    (vol: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = Math.min(1, Math.max(0, vol));
      v.muted = v.volume === 0;
    },
    [videoRef]
  );
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    // unmuting from zero would stay silent; give it a usable level
    if (v.muted && v.volume === 0) v.volume = 0.5;
    v.muted = !v.muted;
  }, [videoRef]);
  const setRate = useCallback(
    (r: number) => {
      if (videoRef.current) videoRef.current.playbackRate = r;
    },
    [videoRef]
  );

  return { state, play, pause, toggle, seek, seekBy, setVolume, toggleMute, setRate };
}
