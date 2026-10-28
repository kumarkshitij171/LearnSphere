# CLAUDE.md — video-transcoder

Node/TypeScript Kafka consumer that transcodes uploaded video to HLS with
FFmpeg. Port `7000`. Read the root `CLAUDE.md` alongside this file — in
particular **Ways of Working**: HLD and LLD are discussed and agreed before
implementation, and implementation lands in numbered phases. The design is
`SYSTEM_DESIGN.md`; Phases 1, 2 and 3a are done.

## Commands

npm, like the other Node services. It is **ESM** (`"type": "module"`) and runs
under `tsx`. Dependency install scripts (the bundled FFmpeg's and FFprobe's
`chmod`, esbuild) are allow-listed in `package.json` → `allowScripts`; a new
dependency that needs one must be added there (`npm install-scripts ls`).

```bash
npm install
npm run dev            # tsx watch src/index.ts
npm test               # node:test over src/**/*.test.ts
npm run build          # tsc
npm start              # node dist/index.js
node src/utils/transcode.js in.mp4 out/   # standalone POC script, see Gotchas
scripts/transcode.sh                      # checks the POC script on generated clips
```

Because it is ESM: relative imports need file extensions, and there is no
`__dirname` — use `fileURLToPath(import.meta.url)`. `tsconfig` targets ES2020
with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`: no `.at()`,
no `replaceAll`.

**FFmpeg and FFprobe are bundled** (`@ffmpeg-installer/ffmpeg`,
`@ffprobe-installer/ffprobe`); `FFMPEG_PATH` / `FFPROBE_PATH` point at a system
install instead. The service **refuses to start** if either is not executable,
or if a required variable (`TRANCODER_API_KEY`, `BACKEND_API_URL`,
`KAFKA_BROKERS`, both S3 buckets) is missing, or if `TRANSCODE_MAX_RUNG` /
`TRANSCODE_PRESET` is invalid — `src/config/validate.ts`.

## Layout

```text
src/
├── index.ts                      entrypoint, HTTP server (/health, /ready, HLS passthrough)
├── errors.ts                     PermanentError + FailureCode
├── config/
│   ├── conf.ts                   env + AWS endpoint selection (the only reader of process.env, bar ffmpeg.ts)
│   ├── ffmpeg.ts                 bundled FFmpeg/FFprobe paths, env overrides
│   └── validate.ts               startup checks
├── services/
│   ├── kafka.service.ts          consumes `video.uploaded`
│   ├── job.service.ts            one message end to end: retry, classify, heartbeat, report
│   ├── s3.service.ts             download source, upload HLS output, stream it back
│   ├── probe.service.ts          ffprobe → SourceInfo (display size after rotation), CODECS
│   ├── ladder.ts                 buildLadder(source, cap?, maxRung) — pure
│   ├── hls.ts                    FFmpeg flags per rendition + master.m3u8 — pure
│   ├── poster.ts                 one JPEG frame for thumbnails
│   ├── transcode.service.ts      download → probe → poster → encode each rung → master → upload
│   └── backend-api.service.ts    the /processed callback, with retry
└── utils/
    ├── logger.ts
    └── transcode.js              standalone POC script — not imported by the service
scripts/transcode.sh              checks the POC script against generated edge-case clips
```

Tests sit next to the code as `*.test.ts` (`node:test` + `node:assert/strict`).
The probe and poster tests run the real bundled binaries on tiny generated clips.

## Pipeline

1. Consume `video.uploaded` from Kafka (published by the backend's confirm step)
2. Download `{videoId}/original.mp4` from the raw bucket
3. Probe it; an unreadable file or one with no video stream is permanent
   (`CORRUPT_OR_UNSUPPORTED`)
4. Build the ladder (`SYSTEM_DESIGN.md` §7.1): the top rung at the source's own
   size, every standard rung below it down to 240p, none above
   `TRANSCODE_MAX_RUNG`, never an upscale, portrait kept portrait. The event's
   optional `resolutions` can only remove rungs
5. Take `poster.jpg`, then FFmpeg each rendition to HLS (6 s segments, a
   keyframe every 2 s in every rendition) and write `master.m3u8` tallest first
6. Upload everything to the processed bucket under `{videoId}/`
7. `POST {backend}/api/v1/video-upload/:videoId/processed` with the
   `X-Transcoder-Api-Key` header: `TRANSCODING` on pickup, then `READY` with
   `hlsMasterPath`, `duration` and `resolutions`, or `FAILED` with `error` and
   `errorCode` (`CORRUPT_OR_UNSUPPORTED` / `SOURCE_MISSING` / `GAVE_UP` / `UNKNOWN`)

A transient failure is retried in place (3 attempts, backoff); a permanent one is
reported once. The handler heartbeats Kafka every 5 s, so a long encode does not
get the consumer evicted and the video transcoded twice. `Video.status` goes
`UPLOADED → TRANSCODING → READY | FAILED`; nothing writes `VideoTranscodeJob`.

## Gotchas

- **This service has no database access.** The backend owns `Video`; everything
  goes through the callback. Do not add a Prisma client back
  (`../DATABASE_DESIGN.md` §3.2).
- **Changing anything under `src/` restarts `npm run dev`** (`tsx watch`),
  killing a job in flight; Kafka redelivers it after the restart.
- `index.ts` streams HLS (and `poster.jpg`) from the processed bucket at
  `/api/video-transcoder/hls/*` with `Range` support. That is the platform's
  bandwidth bottleneck and moves to a CDN in Phase 4.
- **`TRANCODER_API_KEY` is misspelled consistently** across both services. Match
  the existing spelling.
- AWS endpoint selection is driven by `LOCAL_STACK_DATA_SOURCE` and read in
  `src/config/conf.ts`: `true` → LocalStack (`LOCALSTACK_ENDPOINT`, path-style,
  `test`/`test` creds), `false` → real AWS. The backend does the equivalent in
  its own `config/awsConfig.ts`. Never hand-write an endpoint at a call site.
- fluent-ffmpeg splits an option string containing exactly one space into two
  arguments. Pass FFmpeg options as separate array elements with no spaces.
- HDR sources are encoded without tone-mapping (colours look flat) — known and
  deferred, not a bug.
- **`src/utils/transcode.js` is kept on purpose.** It is the original POC: plain
  JS, one local file → HLS on disk, no Kafka/S3/callback. It picks the
  240p–1080p rungs the source can fill, keeps portrait portrait and aligns
  keyframes; it has no poster and stops at 1080p. Nothing imports it and `tsc`
  skips it (no `allowJs`). Do not delete it as dead code. After changing it, run
  `scripts/transcode.sh`, which must report 0 failed.

## Comments

Minimal, generic, to the point. One short line explaining *why* beats a block
restating *what*.
