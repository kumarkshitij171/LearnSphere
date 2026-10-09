import { AUDIO_KBPS, type Rendition } from './ladder.js';

export const SEGMENT_SECONDS = 6;

export interface Variant extends Rendition {
  codecs?: string;
}

/** A rendition's playlist relative to master.m3u8; its directory is named after its label. */
export const playlistUri = (label: string): string => `${label}/playlist.m3u8`;

/** FFmpeg output options for one rendition; the caller supplies the input and the playlist path. */
export const encoderOptions = (
  r: Rendition,
  { preset, hasAudio, segmentPattern }: { preset: string; hasAudio: boolean; segmentPattern: string }
): string[] => [
  '-map', '0:V:0', // the first real video stream, never cover art
  ...(hasAudio ? ['-map', '0:a:0'] : []),
  '-vf', `scale=${r.width}:${r.height}`,
  '-c:v', 'libx264', '-preset', preset, '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-b:v', `${r.videoKbps}k`, '-maxrate', `${r.maxKbps}k`, '-bufsize', `${r.bufKbps}k`,
  // a keyframe every 2 s in every rendition, so ABR can switch at a segment boundary without a stall
  '-force_key_frames', 'expr:gte(t,n_forced*2)', '-sc_threshold', '0',
  '-r', String(r.fps),
  ...(hasAudio ? ['-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`, '-ac', '2'] : ['-an']),
  '-f', 'hls', '-hls_time', String(SEGMENT_SECONDS), '-hls_playlist_type', 'vod',
  '-hls_flags', 'independent_segments', '-hls_segment_filename', segmentPattern,
];

/**
 * master.m3u8, tallest rendition first. Each #EXT-X-STREAM-INF must be followed by its URI on the
 * very next line, or players silently fall back to a single rendition.
 */
// Players (Safari natively, hls.js before it has a bandwidth estimate) start on the first variant
// listed, so it is the one closest to 720p — starting a 4K lesson at 4K makes everyone wait.
const START_SHORT_SIDE = 720;

const shortSide = (v: Variant) => Math.min(v.width, v.height);

export const buildMasterPlaylist = (variants: readonly Variant[]): string => {
  const tallestFirst = [...variants].sort((a, b) => b.width * b.height - a.width * a.height || b.bandwidth - a.bandwidth);
  const start = tallestFirst.find((v) => shortSide(v) <= START_SHORT_SIDE) ?? tallestFirst[tallestFirst.length - 1];
  const ordered = start ? [start, ...tallestFirst.filter((v) => v !== start)] : tallestFirst;
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const v of ordered) {
    const attributes = [`BANDWIDTH=${v.bandwidth}`, `RESOLUTION=${v.width}x${v.height}`, `FRAME-RATE=${v.fps.toFixed(3)}`];
    if (v.codecs) attributes.push(`CODECS="${v.codecs}"`);
    lines.push(`#EXT-X-STREAM-INF:${attributes.join(',')}`, playlistUri(v.label));
  }
  return `${lines.join('\n')}\n`;
};
