import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import {
  downloadVideoFromS3,
  uploadDirectoryToS3,
  cleanupTempFiles,
} from './s3.service.js';
import { config } from '../config/conf.js';
import { ffmpegPath } from '../config/ffmpeg.js';
import { logger } from '../utils/logger.js';
import { TEMP_ROOT } from './temp.service.js';
import { probeSource, probeCodecs } from './probe.service.js';
import { extractPoster, posterTime } from './poster.js';
import { buildLadder, type Rendition } from './ladder.js';
import { buildMasterPlaylist, encoderOptions, type Variant } from './hls.js';
import type { RenditionInfo } from './backend-api.service.js';

ffmpeg.setFfmpegPath(ffmpegPath);

export interface TranscodeOptions {
  bucket: string;
  key: string;
  size?: number;
  videoId?: string;
  resolutions?: string[];
}

export interface TranscodeOutput {
  hlsMasterPath: string;
  renditions: RenditionInfo[];
  durationSec?: number;
}

const encodeRendition = (inputPath: string, dir: string, rendition: Rendition, hasAudio: boolean): Promise<void> =>
  new Promise((resolve, reject) => {
    mkdirSync(dir, { recursive: true });
    const options = encoderOptions(rendition, {
      preset: config.transcode.preset,
      hasAudio,
      segmentPattern: join(dir, 'segment_%03d.ts'),
    });
    ffmpeg(inputPath)
      .outputOptions(options)
      .output(join(dir, 'playlist.m3u8'))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

/**
 * Source-aware HLS: probe the upload, build its ladder (never upscaling, the top rung at the
 * source's own size), encode each rendition, then write the master playlist from the actual sizes.
 * Output: {videoId}/master.m3u8, {videoId}/{label}/playlist.m3u8 + segments, {videoId}/poster.jpg.
 * Throws on failure.
 */
export const transcodeVideo = async (options: TranscodeOptions): Promise<TranscodeOutput> => {
  const { bucket, key, videoId = 'output', resolutions } = options;

  const jobId = `transcode-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const tempDir = join(TEMP_ROOT, jobId);
  const inputPath = join(tempDir, 'input.mp4');
  const outputDir = join(tempDir, 'hls');

  try {
    mkdirSync(outputDir, { recursive: true });
    await downloadVideoFromS3(bucket, key, inputPath);

    const source = await probeSource(inputPath);
    const ladder = buildLadder(source, resolutions, config.transcode.maxRung);
    logger.info(`Transcoding ${videoId}: ${source.width}x${source.height} ${source.codec} @ ${source.fps.toFixed(2)} fps`, {
      renditions: ladder.map((r) => r.label),
      preset: config.transcode.preset,
    });
    if (source.hdr) logger.warn(`${videoId} is HDR; it is encoded without tone-mapping, so colours will look flat`);

    // uploaded with the HLS as {videoId}/poster.jpg; a video without one still plays, so it never fails the job
    const posterPath = join(outputDir, 'poster.jpg');
    try {
      await extractPoster(inputPath, posterPath, posterTime(source.durationSec, videoId));
    } catch (error) {
      cleanupTempFiles([posterPath]);
      logger.warn(`No poster for ${videoId}, continuing without one: ${(error as Error)?.message}`);
    }

    const variants: Variant[] = [];
    for (const rendition of ladder) {
      const started = Date.now();
      const dir = join(outputDir, rendition.label);
      await encodeRendition(inputPath, dir, rendition, source.hasAudio);
      const codecs = await probeCodecs(join(dir, 'segment_000.ts'));
      variants.push(codecs ? { ...rendition, codecs } : rendition);
      logger.info(
        `[${rendition.label}] ${rendition.width}x${rendition.height} @ ${rendition.videoKbps}k in ${((Date.now() - started) / 1000).toFixed(1)}s`
      );
    }
    writeFileSync(join(outputDir, 'master.m3u8'), buildMasterPlaylist(variants));

    const processedBucket = config.s3?.processedVideoBucket || 'processed-video';
    await uploadDirectoryToS3(processedBucket, videoId, outputDir);

    // the key, never a URL: where the bytes are served from is a deployment decision
    const hlsMasterPath = `${videoId}/master.m3u8`;
    logger.info(`HLS transcoding completed: ${hlsMasterPath}`);
    return {
      hlsMasterPath,
      renditions: ladder.map(({ label, width, height, bandwidth }) => ({ label, width, height, bandwidth })),
      ...(source.durationSec > 0 ? { durationSec: source.durationSec } : {}),
    };
  } finally {
    cleanupTempFiles([tempDir]);
  }
};
