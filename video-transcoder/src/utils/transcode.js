import ffmpeg from 'fluent-ffmpeg';
import { join, dirname, resolve } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync, execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HLS_SEGMENT_DURATION = 6;
// keyframes at the same instants in every rendition, so a player can switch quality at any segment
const KEYFRAME_INTERVAL = 2;

// `size` is the short side: the height of a landscape video, the width of a portrait one
const RESOLUTION_CONFIGS = {
  '240p': { size: 240, bitrate: '400k', bandwidth: 400000 },
  '480p': { size: 480, bitrate: '1000k', bandwidth: 1000000 },
  '720p': { size: 720, bitrate: '2500k', bandwidth: 2500000 },
  '1080p': { size: 1080, bitrate: '5000k', bandwidth: 5000000 },
};

const resolutions = ['240p', '480p', '720p', '1080p'];

let ffprobePath = 'ffprobe';

function isInstalled(binary) {
  try {
    execSync(`${binary} -version`, { stdio: 'ignore' });
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
    console.log('✅ Using bundled FFmpeg from @ffmpeg-installer/ffmpeg');
  } catch (error) {
    if (isInstalled('ffmpeg')) {
      console.log('✅ Using system FFmpeg');
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

  try {
    ffprobePath = (await import('@ffprobe-installer/ffprobe')).path;
    console.log('✅ Using bundled FFprobe from @ffprobe-installer/ffprobe\n');
  } catch (error) {
    if (!isInstalled('ffprobe')) {
      console.error('\n❌ FFprobe is not installed! Run `npm install` here, or install FFmpeg (it ships ffprobe).\n');
      return false;
    }
    console.log('✅ Using system FFprobe\n');
  }
  return true;
}

// the size a player shows: sample aspect ratio and phone rotation applied
function probeVideo(inputPath) {
  let stream;
  try {
    const out = execFileSync(
      ffprobePath,
      ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', inputPath],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    stream = JSON.parse(out.toString()).streams?.[0];
  } catch (error) {
    throw new Error(`Not a readable video: ${error.stderr?.toString().trim() || error.message}`);
  }
  if (!stream?.width || !stream?.height) {
    throw new Error('The file has no video stream');
  }

  const [sarNum, sarDen] = String(stream.sample_aspect_ratio || '1:1').split(':').map(Number);
  const width = sarNum > 0 && sarDen > 0 ? Math.round((stream.width * sarNum) / sarDen) : stream.width;
  const rotation = Number(
    stream.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0
  );
  return Math.abs(rotation) % 180 === 90
    ? { width: stream.height, height: width }
    : { width, height: stream.height };
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// never upscale: only the sizes the source can fill, or the smallest one for a tiny source
function pickRenditions(source) {
  const shortSide = Math.min(source.width, source.height);
  const fitting = resolutions.filter((r) => RESOLUTION_CONFIGS[r].size <= shortSide);
  return (fitting.length ? fitting : resolutions.slice(0, 1)).map((resolution) => {
    const { size, bitrate, bandwidth } = RESOLUTION_CONFIGS[resolution];
    const scale = size / shortSide;
    return {
      resolution,
      bitrate,
      bandwidth,
      width: even(source.width * scale),
      height: even(source.height * scale),
    };
  });
}

async function transcodeToHLS(inputPath, outputDir, renditions) {
  const hlsDir = join(outputDir, 'hls');
  if (!existsSync(hlsDir)) {
    mkdirSync(hlsDir, { recursive: true });
  }

  const resolutionPaths = [];

  for (const rendition of renditions) {
    const { resolution, width, height, bitrate, bandwidth } = rendition;
    const resDir = join(hlsDir, resolution);
    mkdirSync(resDir, { recursive: true });

    const segmentPattern = join(resDir, 'segment_%03d.ts');
    const playlistPath = join(resDir, 'playlist.m3u8');

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        // separate arguments, so fluent-ffmpeg does not split a path that contains a space
        .outputOptions(
          '-vf', `scale=${width}:${height},setsar=1`,
          '-c:v', 'libx264',
          '-b:v', bitrate,
          '-pix_fmt', 'yuv420p',
          '-force_key_frames', `expr:gte(t,n_forced*${KEYFRAME_INTERVAL})`,
          '-sc_threshold', '0',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-hls_time', String(HLS_SEGMENT_DURATION),
          '-hls_playlist_type', 'vod',
          '-hls_segment_filename', segmentPattern,
          '-hls_flags', 'independent_segments',
          '-f', 'hls'
        )
        .output(playlistPath)
        .on('start', () => {
          console.log(`🔄 [${resolution}] HLS starting (${width}x${height})...`);
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
            bandwidth,
            width,
            height,
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

  if (!existsSync(inputPath)) {
    console.error(`❌ Error: Input file not found: ${inputPath}`);
    console.error('   Usage: node src/utils/transcode.js <input-video> [output-dir]');
    process.exit(1);
  }

  let source;
  try {
    source = probeVideo(inputPath);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
  const renditions = pickRenditions(source);

  console.log('🎬 Video Transcoding Tool (HLS m3u8 + segments)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📹 Input: ${inputPath} (${source.width}x${source.height})`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`📐 Resolutions: ${renditions.map((r) => r.resolution).join(', ')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    const { masterPath, resolutionPaths } = await transcodeToHLS(inputPath, outputDir, renditions);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 HLS transcoding completed successfully!');
    console.log(`   Master playlist: ${masterPath}`);
    console.log('   Variants:\n');
    resolutionPaths.forEach((r) => {
      console.log(
        `   ✓ ${r.resolution.padEnd(6)} ${r.playlistPath} (${r.width}x${r.height}, BANDWIDTH=${r.bandwidth})`
      );
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
