import ffmpeg from 'fluent-ffmpeg';
import { existsSync, statSync } from 'fs';
import { ffmpegPath } from '../config/ffmpeg.js';

ffmpeg.setFfmpegPath(ffmpegPath);

/** Where to take the poster: ~10% in, past any fade from black, at least 1 s; a shorter clip gets its middle. */
export const posterTime = (durationSec: number): number => {
  const at = Math.max(durationSec * 0.1, 1);
  return at < durationSec ? at : durationSec / 2;
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
