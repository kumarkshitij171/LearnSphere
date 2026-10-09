import { accessSync, constants } from 'fs';

const REQUIRED = [
  'TRANCODER_API_KEY',
  'BACKEND_API_URL',
  'KAFKA_BROKERS',
  'S3_RAW_VIDEO_BUCKET',
  'S3_PROCESSED_VIDEO_BUCKET',
] as const;

const X264_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'];

/** Every reason the service cannot do its job, empty when it can. `binaries` maps a name to its path. */
export const configProblems = (
  env: NodeJS.ProcessEnv,
  binaries: Record<string, string>,
  isExecutable: (path: string) => boolean = canExecute
): string[] => {
  const problems: string[] = REQUIRED.filter((name) => !env[name]?.trim()).map((name) => `${name} is not set`);

  // a bad value would fail every encode, so it is a startup problem rather than a per-video one
  const maxRung = env.TRANSCODE_MAX_RUNG?.trim();
  if (maxRung && !(/^\d+$/.test(maxRung) && Number(maxRung) >= 240)) {
    problems.push(`TRANSCODE_MAX_RUNG must be a whole number of at least 240, got "${maxRung}"`);
  }
  const preset = env.TRANSCODE_PRESET?.trim();
  if (preset && !X264_PRESETS.includes(preset)) {
    problems.push(`TRANSCODE_PRESET must be one of ${X264_PRESETS.join(', ')}, got "${preset}"`);
  }

  for (const [name, path] of Object.entries(binaries)) {
    if (!isExecutable(path)) problems.push(`${name} is not executable at ${path}`);
  }
  return problems;
};

const canExecute = (path: string): boolean => {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
