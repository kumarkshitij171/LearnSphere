import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

// the bundled binaries unless FFMPEG_PATH / FFPROBE_PATH point at a system install
export const ffmpegPath = process.env.FFMPEG_PATH || ffmpegInstaller.path;
export const ffprobePath = process.env.FFPROBE_PATH || ffprobeInstaller.path;
