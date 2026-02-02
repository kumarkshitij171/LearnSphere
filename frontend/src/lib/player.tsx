'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export interface HlsLevel {
  height: number;
  width: number;
  bitrate: number;
  label: string;
}

export interface HlsPlayerProps {
  /** Master playlist URL (e.g. .m3u8) */
  src: string;
  /** Show quality selector (Auto + per-level buttons) */
  showQualitySelector?: boolean;
  /** Optional class name for the video container */
  className?: string;
  /** Optional video element props */
  videoProps?: React.ComponentPropsWithoutRef<'video'>;
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
  const [currentLevel, setCurrentLevel] = useState<number>(-1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setError(null);
    setLoading(true);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLoading(false);
        const levelList = data.levels.map((level, index) => ({
          height: level.height,
          width: level.width,
          bitrate: level.bitrate,
          label: level.height ? `${level.height}p` : `Level ${index}`,
        }));
        setLevels(levelList);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setCurrentLevel(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError(data.type + ': ' + data.details);
          setLoading(false);
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      setLoading(false);
    } else {
      setError('HLS is not supported in this browser');
      setLoading(false);
    }
  }, [src]);

  const handleQualityChange = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls || levelIndex < 0) return;
    hls.currentLevel = levelIndex;
    setCurrentLevel(levelIndex);
  };

  return (
    <div className={className}>
      {error && (
        <p className="text-sm text-destructive bg-red-50 border border-red-200 rounded px-3 py-2 mb-2">
          {error}
        </p>
      )}
      {loading && (
        <p className="text-muted-foreground text-sm mb-2">Loading HLS stream...</p>
      )}
      <div className="rounded-lg overflow-hidden bg-black aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          playsInline
          muted={false}
          autoPlay={false}
          {...videoProps}
        />
      </div>
      {showQualitySelector && levels.length > 0 && (
        <div className="space-y-2 mt-3">
          <Label>Quality</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={currentLevel === -1 ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleQualityChange(-1)}
            >
              Auto
            </Button>
            {levels.map((level, index) => (
              <Button
                key={index}
                variant={currentLevel === index ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQualityChange(index)}
              >
                {level.label}
                {level.bitrate ? ` (${(level.bitrate / 1000).toFixed(0)} kbps)` : ''}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
