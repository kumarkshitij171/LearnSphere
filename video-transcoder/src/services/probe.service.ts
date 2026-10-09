import { execFile } from 'child_process';
import { ffprobePath } from '../config/ffmpeg.js';
import { PermanentError } from '../errors.js';

export interface SourceInfo {
  width: number; // display size: sample aspect ratio and rotation already applied
  height: number;
  fps: number;
  durationSec: number;
  bitrateKbps?: number;
  hasAudio: boolean;
  codec: string;
  hdr: boolean;
}

/** The parts of `ffprobe -print_format json -show_streams -show_format` that are read. */
export interface ProbeOutput {
  streams?: ProbeStream[];
  format?: { duration?: string; bit_rate?: string };
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  level?: number;
  width?: number;
  height?: number;
  sample_aspect_ratio?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  bit_rate?: string;
  duration?: string;
  color_transfer?: string;
  disposition?: { attached_pic?: number };
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
}

const HDR_TRANSFERS = ['smpte2084', 'arib-std-b67']; // PQ (HDR10) and HLG

const corrupt = (detail: string) =>
  new PermanentError(`unsupported or corrupt video: ${detail}`, 'CORRUPT_OR_UNSUPPORTED');

/** "30000/1001" or "8:9" as a number; 0 when absent or undefined ("0/0"). */
const ratio = (value?: string): number => {
  const [num, den] = (value ?? '').split(/[/:]/).map(Number);
  return num && den ? num / den : 0;
};

const positive = (value?: string | number): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// newer ffprobe reports only the display-matrix side data, older adds a `rotate` tag; their signs differ
const isQuarterTurn = (stream: ProbeStream): boolean => {
  const sideData = stream.side_data_list?.find((d) => d.rotation !== undefined)?.rotation;
  const degrees = Number(sideData ?? stream.tags?.rotate ?? 0);
  const theta = ((degrees % 360) + 360) % 360;
  return Math.abs(theta - 90) < 1 || Math.abs(theta - 270) < 1;
};

/** Maps ffprobe's JSON to what the ladder needs; no usable video stream is a {@link PermanentError}. */
export const toSourceInfo = (probe: ProbeOutput): SourceInfo => {
  const streams = probe.streams ?? [];
  // cover art is a "video" stream too, and never the one to transcode
  const video = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video) throw corrupt('no video stream');
  const codedWidth = video.width ?? 0;
  const codedHeight = video.height ?? 0;
  if (!(codedWidth > 0 && codedHeight > 0)) throw corrupt(`cannot read the ${video.codec_name ?? 'unknown'} video stream`);

  const sar = ratio(video.sample_aspect_ratio);
  let width = sar > 0 ? Math.round(codedWidth * sar) : codedWidth;
  let height = codedHeight;
  // phones record landscape and tag the rotation; players apply it, so the ladder must too
  if (isQuarterTurn(video)) [width, height] = [height, width];

  const bitrate = positive(video.bit_rate) ?? positive(probe.format?.bit_rate);
  return {
    width,
    height,
    fps: ratio(video.avg_frame_rate) || ratio(video.r_frame_rate) || 30,
    durationSec: positive(probe.format?.duration) ?? positive(video.duration) ?? 0,
    ...(bitrate !== undefined ? { bitrateKbps: Math.round(bitrate / 1000) } : {}),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    codec: video.codec_name ?? 'unknown',
    hdr: HDR_TRANSFERS.includes(video.color_transfer ?? ''),
  };
};

/** RFC 6381 `CODECS` for one rendition, read from what was actually encoded; undefined unless H.264 High. */
export const codecsOf = (probe: ProbeOutput): string | undefined => {
  const streams = probe.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const level = Number(video?.level);
  if (video?.codec_name !== 'h264' || video.profile !== 'High' || !(level > 0)) return undefined;
  // x264 sets no constraint flags for High profile
  const codecs = [`avc1.6400${level.toString(16).padStart(2, '0')}`];
  if (streams.some((s) => s.codec_type === 'audio' && s.codec_name === 'aac')) codecs.push('mp4a.40.2');
  return codecs.join(',');
};

// "[mov,mp4,… @ 0x1238] moov atom not found\n/tmp/…/input.mp4: Invalid data…" → "moov atom not found; Invalid data…"
const describe = (stderr: string, path: string): string => {
  const lines = stderr
    .split('\n')
    .map((line) => line.split(`${path}: `).join('').replace(/^\[[^\]]* @ 0x[0-9a-f]+\]\s*/i, '').trim())
    .filter(Boolean);
  return [...new Set(lines)].join('; ').slice(0, 300);
};

const runFfprobe = (path: string): Promise<ProbeOutput> =>
  new Promise((resolve, reject) => {
    execFile(
      ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path],
      { maxBuffer: 16 * 1024 * 1024, timeout: 120_000 },
      (error, stdout, stderr) => {
        if (error) {
          // an exit code means ffprobe ran and rejected the file; ENOENT, a timeout and the like are ours
          if (typeof error.code !== 'number') return reject(error);
          return reject(corrupt(describe(stderr, path) || `ffprobe exited with code ${error.code}`));
        }
        try {
          resolve(JSON.parse(stdout) as ProbeOutput);
        } catch {
          reject(corrupt('ffprobe output is not JSON'));
        }
      }
    );
  });

export const probeSource = async (path: string): Promise<SourceInfo> => toSourceInfo(await runFfprobe(path));

/** `CODECS` for an encoded segment; a probe failure only costs the attribute, never the job. */
export const probeCodecs = async (segmentPath: string): Promise<string | undefined> => {
  try {
    return codecsOf(await runFfprobe(segmentPath));
  } catch {
    return undefined;
  }
};
