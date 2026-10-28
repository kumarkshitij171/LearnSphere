'use client';

import { VideoPlayer, type VideoPlayerProps } from '@/components/player/video-player';

/** @deprecated use `VideoPlayer` from `@/components/player/video-player`; kept for one release. */
export function HlsPlayer({ src, className }: Pick<VideoPlayerProps, 'src' | 'className'> & { showQualitySelector?: boolean }) {
  return <VideoPlayer src={src} className={className} />;
}
