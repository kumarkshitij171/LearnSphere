import ffmpeg from 'fluent-ffmpeg';
import { existsSync, statSync } from 'fs';
import { ffmpegPath } from '../config/ffmpeg.js';

ffmpeg.setFfmpegPath(ffmpegPath);

// FNV-1a into [0, 1), with murmur3's finaliser so ids differing only in their last character still spread out.
const unitHash = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
};

/**
 * Where to take the poster, YouTube style: anywhere in 15–75% of the video, past the intro and short
 * of the credits, never within 1 s of either end. Seeded by the video id, so a retried encode takes
 * the same frame. A clip under 3 s gets its middle; an unknown duration (0) the first frame.
 */
export const posterTime = (durationSec: number, videoId: string): number => {
  if (durationSec < 3) return durationSec / 2;
  const at = durationSec * (0.15 + 0.6 * unitHash(videoId));
  return Math.min(Math.max(at, 1), durationSec - 1);
};

/** One JPEG frame at `atSec`, at most 1280 wide, aspect kept (rotation is applied, so portrait stays portrait). */
export const extractPoster = async (inputPath: string, outputPath: string, atSec: number): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .seekInput(Number(atSec.toFixed(3)))
      // the quotes keep min()'s comma from splitting the filter; no shell is involved, so they reach FFmpeg as is
      .outputOptions(['-map', '0:V:0', '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '3'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
  // a seek past the last frame exits cleanly having written nothing
  if (!existsSync(outputPath) || statSync(outputPath).size === 0) throw new Error(`no frame at ${atSec}s`);
};
