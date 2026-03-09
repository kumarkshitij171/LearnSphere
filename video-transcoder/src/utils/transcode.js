import ffmpeg from 'fluent-ffmpeg';
import { join, dirname, basename, extname, resolve } from 'path';
import { existsSync, mkdirSync, statSync, writeFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HLS_SEGMENT_DURATION = 6;

const RESOLUTION_CONFIGS = {
  '240p': { width: 426, height: 240, bitrate: '400k', bandwidth: 400000 },
  '480p': { width: 854, height: 480, bitrate: '1000k', bandwidth: 1000000 },
  '720p': { width: 1280, height: 720, bitrate: '2500k', bandwidth: 2500000 },
  '1080p': { width: 1920, height: 1080, bitrate: '5000k', bandwidth: 5000000 },
};

const resolutions = ['240p', '480p', '720p', '1080p'];

function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

async function setupFFmpeg() {
  try {
    const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
    const ffmpegPath = ffmpegInstaller.path;
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log('✅ Using bundled FFmpeg from @ffmpeg-installer/ffmpeg\n');
    return true;
  } catch (error) {
    if (checkFFmpeg()) {
      console.log('✅ Using system FFmpeg\n');
      return true;
    } else {
      console.error('\n❌ FFmpeg is not installed!\n');
      console.error('Please install FFmpeg using one of these methods:\n');
      console.error('1. Using Homebrew (macOS):');
      console.error('   brew install ffmpeg\n');
      console.error('2. Or install @ffmpeg-installer/ffmpeg package:');
      console.error('   npm install @ffmpeg-installer/ffmpeg\n');
      console.error('3. Or download from: https://ffmpeg.org/download.html\n');
      return false;
    }
  }
}

async function transcodeToHLS(inputPath, outputDir) {
  const hlsDir = join(outputDir, 'hls');
  if (!existsSync(hlsDir)) {
    mkdirSync(hlsDir, { recursive: true });
  }

  const resolutionPaths = [];

  for (const resolution of resolutions) {
    const config = RESOLUTION_CONFIGS[resolution];
    const resDir = join(hlsDir, resolution);
    mkdirSync(resDir, { recursive: true });

    const segmentPattern = join(resDir, 'segment_%03d.ts');
    const playlistPath = join(resDir, 'playlist.m3u8');

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          `-vf scale=${config.width}:${config.height}`,
          '-c:v libx264',
          `-b:v ${config.bitrate}`,
          '-c:a aac',
          '-b:a 128k',
          `-hls_time ${HLS_SEGMENT_DURATION}`,
          '-hls_playlist_type vod',
          `-hls_segment_filename ${segmentPattern}`,
          '-hls_flags independent_segments',
          '-pix_fmt yuv420p',
          '-f hls',
        ])
        .output(playlistPath)
        .on('start', () => {
          console.log(`🔄 [${resolution}] HLS starting...`);
        })
        .on('progress', (progress) => {
          const percent = progress.percent || 0;
          if (percent > 0 && percent % 25 < 1) {
            process.stdout.write(`\r   [${resolution}] HLS ${percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          console.log(`\r✅ [${resolution}] HLS completed`);
          resolutionPaths.push({
            resolution,
            playlistPath: `${resolution}/playlist.m3u8`,
            bandwidth: config.bandwidth,
            width: config.width,
            height: config.height,
          });
          resolve();
        })
        .on('error', (err) => {
          console.error(`\n❌ [${resolution}] HLS error:`, err.message);
          reject(err);
        })
        .run();
    });
  }

  // Write master.m3u8
  const masterLines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const r of resolutionPaths) {
    masterLines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.width}x${r.height}`,
      r.playlistPath
    );
  }
  const masterPath = join(hlsDir, 'master.m3u8');
  writeFileSync(masterPath, masterLines.join('\n') + '\n');
  console.log(`✅ master.m3u8 written to ${masterPath}`);

  return { masterPath, resolutionPaths };
}

async function main() {
  if (!(await setupFFmpeg())) {
    process.exit(1);
  }

  const inputPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(__dirname, '../constants/clip1.mp4');

  const outputDir = process.argv[3]
    ? resolve(process.cwd(), process.argv[3])
    : resolve(__dirname, '../constants/out');

  console.log('🎬 Video Transcoding Tool (HLS m3u8 + segments)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📹 Input: ${inputPath}`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`📐 Resolutions: ${resolutions.join(', ')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!existsSync(inputPath)) {
    console.error(`❌ Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    const { masterPath, resolutionPaths } = await transcodeToHLS(inputPath, outputDir);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 HLS transcoding completed successfully!');
    console.log(`   Master playlist: ${masterPath}`);
    console.log('   Variants:\n');
    resolutionPaths.forEach((r) => {
      console.log(`   ✓ ${r.resolution.padEnd(6)} ${r.playlistPath} (BANDWIDTH=${r.bandwidth})`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
