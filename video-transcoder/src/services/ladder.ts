import type { SourceInfo } from './probe.service.js';

export interface Rendition {
  label: string; // "2160p", "900p"
  width: number; // even, aspect kept, never above the source
  height: number;
  fps: number; // the source's, capped at 60
  videoKbps: number;
  maxKbps: number;
  bufKbps: number;
  bandwidth: number; // #EXT-X-STREAM-INF BANDWIDTH in bit/s: peak video + audio
}

/** Standard rungs, tallest first, with their H.264 video bitrate at 30 fps or less. */
const RUNGS = [
  { height: 2160, kbps: 14000 },
  { height: 1440, kbps: 8000 },
  { height: 1080, kbps: 5000 },
  { height: 720, kbps: 2800 },
  { height: 480, kbps: 1200 },
  { height: 360, kbps: 800 },
  { height: 240, kbps: 400 },
] as const;

export const DEFAULT_MAX_RUNG = 2160;
export const AUDIO_KBPS = 128;
const MAX_FPS = 60;
// a size this close to a standard rung takes its name, so 1920×1088 is "1080p", not "1088p" plus a near-duplicate 1080p
const SNAP_TOLERANCE = 0.02;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const evenFloor = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** Height of the 16:9 box a video fits in, YouTube-style: 1920×800 is 1080p, and so is a portrait 1080×1920. */
export const tierOf = (width: number, height: number): number =>
  Math.max(Math.min(width, height), (Math.max(width, height) * 9) / 16);

// pixel count grows with tier², so a native rung is interpolated on that between its neighbours
const kbpsForTier = (tier: number): number => {
  const below = RUNGS.find((r) => r.height <= tier);
  const above = [...RUNGS].reverse().find((r) => r.height >= tier);
  if (below && above) {
    if (below.height === above.height) return below.kbps;
    const t = (tier ** 2 - below.height ** 2) / (above.height ** 2 - below.height ** 2);
    return below.kbps + t * (above.kbps - below.kbps);
  }
  const edge = (below ?? above)!; // off the table: scale the nearest end by pixel count
  return edge.kbps * (tier / edge.height) ** 2;
};

// keeps the requested rungs; asking for more than the top gets the top, so a cap can never upscale.
// A cap that matches nothing is ignored rather than producing no video at all.
const applyCap = <T extends { tier: number }>(sizes: T[], cap?: readonly string[]): T[] => {
  const requested = (cap ?? []).map((label) => parseInt(label, 10)).filter((h) => h > 0);
  if (!requested.length) return sizes;
  const top = sizes[0]?.tier ?? 0;
  const kept = sizes.filter((s) => requested.includes(s.tier) || (s.tier === top && requested.some((h) => h > top)));
  return kept.length ? kept : sizes;
};

/**
 * The renditions for one source, tallest first: the source at its own size (its original quality),
 * then every standard rung below it, none above `maxRung`. Never upscales. `cap` is the optional
 * `resolutions` list from the event and can only remove rungs.
 */
export const buildLadder = (source: SourceInfo, cap?: readonly string[], maxRung = DEFAULT_MAX_RUNG): Rendition[] => {
  const exactTier = tierOf(source.width, source.height);
  const tier = RUNGS.find((r) => Math.abs(exactTier - r.height) <= r.height * SNAP_TOLERANCE)?.height ?? Math.round(exactTier);
  const sourceWidth = evenFloor(source.width);
  const sourceHeight = evenFloor(source.height);

  const sizes: Array<{ tier: number; width: number; height: number }> = [];
  if (tier <= maxRung) sizes.push({ tier, width: sourceWidth, height: sourceHeight });
  for (const rung of RUNGS) {
    if (rung.height >= tier || rung.height > maxRung) continue;
    const scale = rung.height / exactTier;
    sizes.push({
      tier: rung.height,
      width: Math.min(even(source.width * scale), sourceWidth),
      height: Math.min(even(source.height * scale), sourceHeight),
    });
  }

  const fps = Math.min(source.fps, MAX_FPS);
  const audioKbps = source.hasAudio ? AUDIO_KBPS : 0;
  return applyCap(sizes, cap).map(({ tier, width, height }) => {
    const target = kbpsForTier(tier) * (fps > 30 ? 1.5 : 1);
    // re-encoding above the source's own bitrate adds bytes, not quality
    const videoKbps = Math.max(1, Math.round(source.bitrateKbps ? Math.min(target, source.bitrateKbps) : target));
    // capped VBR
    const maxKbps = Math.round(videoKbps * 1.07);
    return {
      label: `${tier}p`,
      width,
      height,
      fps,
      videoKbps,
      maxKbps,
      bufKbps: videoKbps * 2,
      bandwidth: (maxKbps + audioKbps) * 1000,
    };
  });
};
