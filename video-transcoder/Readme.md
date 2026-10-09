# LearnSphere video-transcoder

Turns an instructor's uploaded video into something every viewer can stream. When the backend
announces an upload on Kafka, this service downloads the original from S3, probes it, and
transcodes it with FFmpeg into an HLS ladder built from the source itself: the top rendition at the
source's own resolution (up to 2160p), every standard rung below it down to 240p, never an upscale,
portrait kept portrait. It adds a poster frame, uploads everything to the processed bucket, and
tells the backend the video is ready — with its duration and renditions — or why it failed. It also
streams that HLS to the player. Node.js + TypeScript, port `7000`.

> How it is built and why: [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md).

## Prerequisites

- Node.js 22+ and npm
- Nothing extra for FFmpeg or FFprobe: both are bundled (`@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`); set `FFMPEG_PATH` / `FFPROBE_PATH` to use your own
- The local stack running: `docker compose up -d` from the repo root (Kafka, LocalStack S3)
- The backend running, to receive the "processed" callback

## Setup

```bash
npm install
cp .env.sample .env            # see Configuration below
```

## Run

```bash
npm run dev                    # watch mode — http://localhost:7000/health
npm test                       # node:test, including real-ffprobe checks on generated clips
npm run build && npm start      # compiled
```

## Trying it end to end

1. Sign in as an instructor in the frontend and upload a video to a course.
2. Watch this service's log: download → probe (the ladder it chose) → poster → one FFmpeg pass per rendition → upload → callback.
3. The video's status in the course page goes from *Processing* to playable.

## Configuration

| Variable | Purpose |
|---|---|
| `PORT` | default `7000` |
| `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_TOPIC_VIDEO_TRANSCODE` | the upload events; topic default `video.uploaded` |
| `LOCAL_STACK_DATA_SOURCE` | `true` = LocalStack (`LOCALSTACK_ENDPOINT`, default `http://localhost:4566`), `false` = real AWS |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | real AWS only; LocalStack uses `test`/`test` |
| `S3_RAW_VIDEO_BUCKET`, `S3_PROCESSED_VIDEO_BUCKET` | where originals are read and HLS is written |
| `BACKEND_API_URL` | the backend, for the "processed" callback |
| `TRANCODER_API_KEY` | sent on that callback; must match the backend's (the spelling is deliberate) |
| `CORS_ALLOW_ORIGIN` | origins allowed to stream HLS, default `http://localhost:3000` |
| `LOG_LEVEL` | winston level |
| `FFMPEG_PATH`, `FFPROBE_PATH` | optional; a system FFmpeg / FFprobe instead of the bundled ones |
| `TRANSCODE_MAX_RUNG` | optional, default `2160`; the tallest rendition produced — a taller source tops out here (whole number, at least `240`) |
| `TRANSCODE_PRESET` | optional, default `veryfast`; the x264 preset (`medium` is ~10–15% smaller and slower) |

The service refuses to start if a required variable is missing, an optional one is invalid, or
FFmpeg / FFprobe is not executable.

## Endpoints

| Method | Path | What |
|---|---|---|
| `GET` | `/health` | liveness |
| `GET` | `/ready` | readiness: `200 { ready: true }` only while this instance is in the Kafka consumer group, else `503` |
| `GET` | `/api/video-transcoder/hls/{videoId}/master.m3u8` | the HLS playlist, then its variants (`{label}/playlist.m3u8`) and segments, with `Range` support |
| `GET` | `/api/video-transcoder/hls/{videoId}/poster.jpg` | the poster frame (`image/jpeg`, at most 1280 wide); `404` for videos transcoded before posters existed |

## Troubleshooting

- **Player shows `manifestLoadError` after Docker restarted** — free LocalStack keeps S3 in memory,
  so a restart deletes every uploaded and transcoded video (the buckets are recreated empty on
  start). Re-upload the video. Does not happen on real AWS — see `../ARCHITECTURE.md` §8.1.
- **Video stuck in "Processing"** — check this service consumed the event (Kafka UI on `:8080`,
  topic `video.uploaded`) and that `BACKEND_API_URL` / `TRANCODER_API_KEY` match the backend.
- **`FFmpeg is not executable` / `FFprobe is not executable` at startup** — `FFMPEG_PATH` / `FFPROBE_PATH` points somewhere wrong, or `npm install` skipped the bundled binary's install script (`npm install-scripts ls`).
- **Video `FAILED`** — `Video.metadata` holds `error` and an `errorCode`: `CORRUPT_OR_UNSUPPORTED` (ffprobe or FFmpeg cannot read it — replace the file), `SOURCE_MISSING` (no original in the raw bucket), `GAVE_UP` (a transient failure outlasted 3 attempts — retrying may work), `UNKNOWN`.
- **Player 404s** — the processed bucket must contain `{videoId}/master.m3u8`; list it with
  `aws --endpoint-url http://localhost:4566 s3 ls s3://<processed bucket>/<videoId>/`.
