/** Why a transcode failed, for the UI: "replace the file" or "retry processing". */
export type FailureCode = 'CORRUPT_OR_UNSUPPORTED' | 'SOURCE_MISSING' | 'GAVE_UP' | 'UNKNOWN';

/** A failure that a retry cannot fix: the file is missing or not a video, or the backend refused. */
export class PermanentError extends Error {
  override name = 'PermanentError';
  readonly code: FailureCode;

  constructor(message: string, code: FailureCode = 'UNKNOWN') {
    super(message);
    this.code = code;
  }
}
