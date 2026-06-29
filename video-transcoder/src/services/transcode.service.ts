import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import {
  downloadVideoFromS3,
  uploadDirectoryToS3,
  cleanupTempFiles,
} from './s3.service.js';
import { config } from '../config/conf.js';
import { logger } from '../utils/logger.js';

export interface TranscodeOptions {
  bucket: string;
  key: string;
  size?: number;
  videoId?: string;
  resolutions?: string[];
}

export interface TranscodeResult {
  success: boolean;
  hlsMasterPath?: string;
  resolutions: Array<{
    resolution: string;
    playlistPath: string;
    bandwidth?: number;
  }>;
  error?: string;
}

const RESOLUTION_CONFIGS: Record<
  string,
  { width: number; height: number; bitrate: string; bandwidth: number }
> = {
  '240p': { width: 426, height: 240, bitrate: '400k', bandwidth: 400000 },
  '480p': { width: 854, height: 480, bitrate: '1000k', bandwidth: 1000000 },
  '720p': { width: 1280, height: 720, bitrate: '2500k', bandwidth: 2500000 },
  '1080p': { width: 1920, height: 1080, bitrate: '5000k', bandwidth: 5000000 },
};

const HLS_SEGMENT_DURATION = 6;

/**
 * Transcode video to HLS (multiple resolutions, master playlist + segments).
 * Output: videoId/master.m3u8, videoId/240p/playlist.m3u8 + *.ts, etc.
 */
export const transcodeVideo = async (
  options: TranscodeOptions
): Promise<TranscodeResult> => {
  const {
    bucket,
    key,
    videoId = 'output',
    resolutions = ['240p', '480p', '720p', '1080p'],
  } = options;

  const jobId = `transcode-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const tempDir = `/tmp/video-transcode/${jobId}`;
  const inputPath = join(tempDir, 'input.mp4');
  const outputDir = join(tempDir, 'hls');
  const cleanupPaths: string[] = [tempDir];

  try {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    mkdirSync(outputDir, { recursive: true });

    logger.info(`Starting HLS transcoding for: ${key} (videoId: ${videoId})`, { resolutions });

    // Step 1: Download from S3
    logger.info('Step 1/4: Downloading video from S3...');
    await downloadVideoFromS3(bucket, key, inputPath);
    cleanupPaths.push(inputPath);

    // Step 2: Generate HLS per resolution
    logger.info('Step 2/4: Generating HLS per resolution...');
    const resolutionPaths: Array<{ resolution: string; playlistPath: string; bandwidth: number }> =
      [];

    for (const resolution of resolutions) {
      const rc = RESOLUTION_CONFIGS[resolution];
      if (!rc) throw new Error(`Invalid resolution: ${resolution}`);

      const resDir = join(outputDir, resolution);
      mkdirSync(resDir, { recursive: true });
      const segmentPattern = join(resDir, 'segment_%03d.ts');
      const playlistPath = join(resDir, 'playlist.m3u8');

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .outputOptions([
            `-vf scale=${rc.width}:${rc.height}`,
            `-c:v libx264`,
            `-b:v ${rc.bitrate}`,
            `-c:a aac`,
            `-b:a 128k`,
            `-hls_time ${HLS_SEGMENT_DURATION}`,
            `-hls_playlist_type vod`,
            `-hls_segment_filename ${segmentPattern}`,
            `-hls_flags independent_segments`,
            `-pix_fmt yuv420p`,
            `-f hls`,
          ])
          .output(playlistPath)
          .on('start', () => {
            logger.info(`[${resolution}] FFmpeg started`);
          })
          .on('end', () => {
            logger.info(`[${resolution}] HLS completed`);
            resolve();
          })
          .on('error', (err) => {
            logger.error(`[${resolution}] FFmpeg error: ${err.message}`);
            reject(err);
          })
          .run();
      });

      resolutionPaths.push({
        resolution,
        playlistPath: `${resolution}/playlist.m3u8`,
        bandwidth: rc.bandwidth,
      });
    }

    // Step 3: Write master.m3u8 (each EXT-X-STREAM-INF must be followed by URI on next line)
    const masterLines: string[] = ['#EXTM3U', '#EXT-X-VERSION:3'];
    for (const r of resolutionPaths) {
      const rc = RESOLUTION_CONFIGS[r.resolution];
      if (!rc) continue;
      const { width, height } = rc;
      masterLines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${width}x${height}`,
        r.playlistPath
      );
    }
    const masterPath = join(outputDir, 'master.m3u8');
    writeFileSync(masterPath, masterLines.join('\n') + '\n');
    logger.info('Master playlist written');

    // Step 4: Upload to S3 under processed-videos/videoId/
    logger.info('Step 4/4: Uploading HLS to S3...');
    const processedBucket =
      config.s3?.processedVideoBucket || 'processed-videos';
    const s3Prefix = videoId;

    await uploadDirectoryToS3(processedBucket, s3Prefix, outputDir);

    // hlsMasterPath = key for master playlist (no bucket in DB per your design; frontend can prefix CDN/bucket)
    const hlsMasterPath = `${videoId}/master.m3u8`;

    logger.info(`HLS transcoding completed: ${hlsMasterPath}`);
    cleanupTempFiles(cleanupPaths);

    return {
      success: true,
      hlsMasterPath,
      resolutions: resolutionPaths.map((r) => ({
        resolution: r.resolution,
        playlistPath: `${videoId}/${r.playlistPath}`,
        bandwidth: r.bandwidth,
      })),
    };
  } catch (error: any) {
    logger.error(`Transcoding failed: ${error?.name || 'Error'}: ${error?.message || error}`, {
      stack: error?.stack,
    });
    cleanupTempFiles(cleanupPaths);
    return {
      success: false,
      resolutions: [],
      error: error.message || 'Unknown error occurred',
    };
  }
};
