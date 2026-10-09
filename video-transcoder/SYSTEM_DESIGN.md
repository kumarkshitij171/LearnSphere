# Video Transcoder — System Design

Status: **Phases 1, 2 and 3a are implemented and verified** on the local stack
(2026-10-09). Phases 3b, 4 and 5 are design. Sections that describe the
pre-Phase-1 code (§4, the fixed table in §7) are kept as the record of why.
Port `7000` (see §12.1). Node + TypeScript, npm, **ESM**, `tsx`, FFmpeg.

Per the root `CLAUDE.md` **Ways of Working** this is the HLD and the LLD for
this service. Implementation waits for your reaction and then proceeds phase by
phase.

Wider context: `../ARCHITECTURE.md` (system boundaries, scaling),
`../DATABASE_DESIGN.md` (data ownership, S3 layout). The callback contract it
depends on is `../backend/SYSTEM_DESIGN.md` §8.3.

---

# Part I — HLD

## 1. Purpose and scope

One job: **turn one uploaded file into an adaptive HLS ladder, and tell the
owner when it is done.** It is the only CPU-bound component in the platform and
the only one that may take minutes per unit of work, which is why it is a
separate process behind a durable log rather than a code path in the API.

**In scope.** Consuming `video.uploaded`; downloading the source from S3;
FFmpeg into four renditions plus a master playlist; uploading the output;
reporting status back through the backend callback. Today it also **serves the
HLS bytes** over HTTP — §4 argues that is the one thing it should stop doing.

**Explicitly out of scope.** Deciding *whether* to transcode (the producer
decides), authorisation (the backend decides who may watch), any database write
(§3.1), and — after P1 — serving bytes.

**Non-goals for now.** DRM, per-title encoding, thumbnail or sprite generation,
subtitle extraction, live transcoding, AV1 or HEVC. The pipeline leaves room for
thumbnails and subtitles; nothing is built.

---

## 2. Where it sits

```
  backend ──publish video.uploaded──▶ Kafka :9092
                                        │
                                        │ group: video-transcode-consumer-group
                                        ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  video-transcoder :7000                                      │
  │                                                              │
  │  kafka.service ─▶ handleTranscodeMessage                      │
  │                        │                                      │
  │                        ├─▶ backend-api.service  (TRANSCODING) │
  │                        ├─▶ s3.service           (download)    │
  │                        ├─▶ transcode.service    (FFmpeg)      │
  │                        ├─▶ s3.service           (upload dir)  │
  │                        └─▶ backend-api.service  (READY|FAILED)│
  │                                                              │
  │  GET /health                                                 │
  │  GET /api/video-transcoder/hls/*  ─▶ S3 passthrough + Range   │
  └──────────────────────────────────────────────────────────────┘
        │                                   ▲
        ▼                                   │ X-Transcoder-Api-Key
  s3 raw-videos / processed-videos       backend :5000
```

**It holds no state of its own.** Everything it knows arrives in a Kafka message
or an S3 object, which is what makes it freely replaceable and — once §3.2 is
fixed — freely scalable.

---

## 3. Design decisions and why

| Decision | Rationale |
|---|---|
| **A separate service, not a worker inside `backend`** | FFmpeg saturates CPU for minutes. Inside the API process it would starve request handling and couple API deploys to transcode capacity. This was a deliberate re-architecture away from the in-backend BullMQ design `todo.md` originally described |
| **Kafka, not an HTTP call from the backend** | The producer must not know whether this service is up. A redeploy, a crash or scaling to zero means events wait in the log |
| **HLS rather than progressive MP4** | Adaptive bitrate on a mobile connection, and byte-range-friendly segments a CDN can cache individually. The alternative is one big file and a bad experience on anything but good wifi |
| **Four fixed rungs — 240p/480p/720p/1080p at 400k/1000k/2500k/5000k** | Covers 3G to desktop. Fixed rather than per-title because per-title encoding needs a complexity analysis pass that quadruples the cost for a marginal bitrate win at this scale |
| **6-second segments** | The pragmatic middle: shorter means more requests and more playlist churn, longer means coarser bitrate adaptation and slower start |
| **Report via the backend callback; hold no database client** | One writer per table (`../DATABASE_DESIGN.md` §1). The backend owns `Video`, so the transcoder tells it rather than writing behind its back — which is also what makes the `course-service` split cost this service one base URL |
| **S3 keys stored, never URLs** | `hlsMasterPath` is `{videoId}/master.m3u8`. Where bytes are served from is a deployment decision, and it is about to change |
| **`{videoId}/` as the S3 prefix** | One prefix delete removes everything for a video, and relative URIs inside the playlists resolve under the same base — which is precisely what lets a CDN be mounted at that prefix with **no playlist rewrite and no row change** |
| **Temp work under `/tmp/video-transcode/{jobId}`, cleaned on both paths** | A unique job id per message means concurrent jobs cannot collide; cleanup runs on success and on failure |
| **ESM + `tsx`** | Matches the service's own `"type": "module"`. The consequences are real and easy to trip over: relative imports need file extensions and there is no `__dirname` |
| **Kafka failure does not kill the process** | `startService` catches a Kafka connection failure and keeps the HTTP server listening, so playback survives a broker outage. Correct today **because** this service serves playback; it becomes the wrong default once it does not (§4) |

### Rejected

| Option | Why not |
|---|---|
| BullMQ + Redis inside `backend` | The original `todo.md` design. Rejected in favour of a real service boundary; `bullmq` remains an unimported dependency, kept deliberately as reference |
| MediaConvert / Elastic Transcoder | Cheaper to operate and genuinely worth revisiting at volume, but it replaces the thing we are trying to understand and own. Recorded as a trigger, not a no |
| DASH alongside HLS | Doubles storage and encode time for browsers that already play HLS via `hls.js` |
| Transcoding on the fly at playback | Latency and cost per view instead of once per upload |

---

## 4. The two structural issues

### 4.1 It is serving video bytes, and it should not be

`index.ts` mounts `GET /api/video-transcoder/hls/*`, which maps the path to a key
in the processed bucket, calls `getS3ObjectStream` (honouring `Range`) and pipes
it to the response. It is correct, careful code — it normalises the path and
rejects traversal, forwards `Content-Range` and `Accept-Ranges`, handles stream
errors and maps `NoSuchKey` to 404.

**It is still the wrong place for it.** One 1080p stream is ~5 Mbit/s. A hundred
concurrent viewers is ~500 Mbit/s flowing through a single Node process **that is
also meant to be running FFmpeg**, and they compete for the same CPU. Worse, it
couples playback availability to transcoding availability: scale the pool for
encode throughput and you have accidentally scaled your video origin too.

**Decision: CloudFront in front of `s3://processed-videos`**, signed URLs or
signed cookies, and this service stops serving bytes. `frontend/lib/playback.ts`
is the only consumer and the only file that changes. This is **P1** in the
roadmap and the highest-leverage change in the whole system
(`../ARCHITECTURE.md` §6.2).

Until then the route stays, because it is what makes playback work at all.

### 4.2 Three reliability bugs in the consumer

These are specific, small, and each one loses work silently.

**① A failed message is marked `FAILED` and never retried.** `eachMessage`
wraps the handler in `try/catch` and logs, with the comment *"Message will be
retried automatically by Kafka."* **That is not what happens.** kafkajs commits
the offset once `eachMessage` returns without throwing, so swallowing the error
*is* the acknowledgement. A transient S3 blip or an OOM-killed FFmpeg therefore
produces a permanently `FAILED` video that no retry will ever pick up.

*Fix:* classify. A permanent failure (unsupported codec, missing object,
unparseable message) marks `FAILED` and commits. A transient failure
(S3 5xx, timeout, FFmpeg killed) **rethrows**, so the offset is not committed
and the message is redelivered. That requires the handler to be idempotent,
which it nearly is already — re-running overwrites the same deterministic keys —
and a bounded retry count so a genuinely poisonous message cannot block its
partition forever.

**② A missing API key silently skips the callback.** `markVideoProcessed`
returns early with a `warn` when `TRANCODER_API_KEY` is unset. The transcode then
runs to completion, uploads everything, and **nobody is ever told**: the `Video`
row sits at `UPLOADED` forever and the UI polls until it gives up.

*Fix:* **fail fast at startup.** If the key is missing the service must not
start, the same way `backend/app.ts` hard-exits on its required secrets. A
service that boots and quietly discards its only output looks healthy and is not.

**③ No `VideoTranscodeJob` row is ever written.** The table models per-rung
progress (`QUEUED → PROCESSING → COMPLETED`) and nothing populates it — the only
code that would is the dead `db.service.ts` (§3.1 below). So the schema promises
per-resolution visibility the system does not have.

*Fix:* if that visibility is wanted, the callback carries it (§9.2). If it is
not, say so and drop the table. **Either is fine; the current state — modelled,
documented, unimplemented — is the only bad option.**

### 4.3 And one piece of dead code

`src/services/db.service.ts` constructs a `PrismaClient` and exports
`findVideoByKey`, `updateVideoStatus`, `markVideoAsProcessing`, `disconnectDB`.
**Nothing imports any of it** (verified by grep across `src/`), and it would not
work if it did: its status values are `'PROCESSING' | 'COMPLETED' | 'FAILED'`,
none of which is a valid `VideoStatus` (`UPLOADED | TRANSCODING | READY |
FAILED`).

It is the only reason this service carries a duplicated `prisma/schema.prisma`,
a `postinstall` `prisma generate` and a `DATABASE_URL`. **Delete all four.** Full
argument and options in `../DATABASE_DESIGN.md` §3.2.

There is also `src/utils/transcode.js` sitting beside the TypeScript sources —
check which file is actually imported before editing either, and delete the one
that is not.

---

# Part II — LLD

## 5. Module layout

```
src/
├── index.ts                      HTTP server + consumer wiring + handleTranscodeMessage
├── config/conf.ts                env + AWS endpoint selection (the only reader)
├── services/
│   ├── kafka.service.ts          consumer, topic ensure, VideoTranscodeMessage
│   ├── s3.service.ts             download, upload directory, getS3ObjectStream
│   ├── job.service.ts            one message end to end: retry, classify, heartbeat (Phase 2)
│   ├── probe.service.ts          ffprobe → SourceInfo (§7.1)
│   ├── ladder.ts                 buildLadder — pure (§7.1)
│   ├── hls.ts                    FFmpeg flags + master.m3u8 — pure (§7.1)
│   ├── poster.ts                 poster.jpg (§7.1)
│   ├── transcode.service.ts      probe → poster → encode each rung → master → upload
│   └── backend-api.service.ts    the /processed callback
│                                 (db.service.ts, §4.3, is deleted)
└── utils/logger.ts               winston
```

One module per external dependency, and `conf.ts` is the only reader of
`process.env`. **Never hand-write an AWS endpoint at a call site** — the
LocalStack/AWS switch lives in one place and must stay there.

## 6. The inbound contract

Produced by `backend/services/kafka.service.ts` on topic `video.uploaded`,
3 partitions, keyed by user.

```ts
export interface VideoTranscodeMessage {
  videoId: string;
  userId: string;
  bucket: string;
  key: string;            // {videoId}/original.mp4
  inputS3Path?: string;
  resolutions?: string[]; // optional cap (§7.1); the backend no longer sends it
  size?: number;
  timestamp?: string;
}
```

A message without `videoId` is logged and dropped — there is nothing to report
against, so retrying cannot help.

Consumer config: group `video-transcode-consumer-group`, `fromBeginning: false`,
`sessionTimeout` 30s, `heartbeatInterval` 3s, 3 connection retries,
`connectionTimeout` 5s, `requestTimeout` 30s.

### 6.1 The session-timeout trap

`sessionTimeout` is 30 s and a single message can occupy the handler for
**minutes**. kafkajs heartbeats from its own loop between batches rather than
during a long `eachMessage`, so a long encode risks the consumer being evicted
from the group mid-job — the partition is reassigned, the work is done twice,
and the first worker's callback lands after the second's.

This has not bitten because concurrency is low and messages are few. It is the
first thing that will break under load. The fix is to heartbeat explicitly from
the handler (`eachMessage` receives `heartbeat()`) on FFmpeg progress events,
which the ladder loop already receives. **Phase 2.**

## 7. The transcode pipeline

```
 ① download   s3://{bucket}/{key} ──▶ /tmp/video-transcode/{jobId}/input.mp4
 ② per rung   ffmpeg -vf scale=W:H -b:v BITRATE -hls_time 6
                 ──▶ {jobId}/hls/{res}/playlist.m3u8 + segment_%03d.ts
 ③ master     write {jobId}/hls/master.m3u8
                 #EXT-X-STREAM-INF:BANDWIDTH=…,RESOLUTION=WxH
                 {res}/playlist.m3u8          ← URI must be the NEXT line
 ④ upload     uploadDirectoryToS3(processed, "{videoId}/", {jobId}/hls)
 ⑤ cleanup    remove the temp tree — on success and on failure
 ⑥ report     callback READY + hlsMasterPath = "{videoId}/master.m3u8"
```

| Rung | Scale | Bitrate | `BANDWIDTH` |
|---|---|---|---|
| 240p | 426×240 | 400k | 400000 |
| 480p | 854×480 | 1000k | 1000000 |
| 720p | 1280×720 | 2500k | 2500000 |
| 1080p | 1920×1080 | 5000k | 5000000 |

Two details that are load-bearing and look like trivia:

- **In `master.m3u8`, each `#EXT-X-STREAM-INF` must be followed by its URI on
  the very next line.** Get it wrong and players silently fall back to one
  rendition. There is a comment in the source saying so; keep it.
- **Fixed `-vf scale=W:H` ignores the source aspect ratio.** A 4:3 or portrait
  upload is stretched. The fix is `scale=w=W:h=H:force_original_aspect_ratio=decrease`
  plus `pad`, and it is **Phase 3** — it is a visible-quality bug, not a
  theoretical one.

The rungs are encoded **sequentially**, so a 10-minute video takes four passes.
Rung-level parallelism is the obvious win and the reason `VideoTranscodeJob`
exists — §4.2 ③ and §10.

## 7.1 Source-aware ladder — agreed

> **Status: implemented and verified — Phase 3a, 2026-10-09** (agreed: top rung 2160p; native top
> rung for non-standard sizes; `veryfast`). It replaces the fixed table above. Portrait sources stay
> portrait at every rung — a 9:16 upload is never fitted into a 16:9 frame. What was decided while
> building it is under *Implementation notes* below.

### HLD

**The problem.** The ladder is fixed at 240p–1080p regardless of the upload:

- a **4K** upload is capped at 1080p — the best version the creator made is never seen;
- a **480p** upload is *upscaled* to 720p and 1080p — two extra renditions that are larger, slower
  to make, and no sharper than the 480p one;
- every rendition is forced to 16:9 (§7), so portrait and 4:3 uploads are stretched.

**The rule.** Probe the source first, then:

1. **The top rung is always the original quality** — the source re-encoded at its own resolution.
2. **Below it, every standard rung smaller than the source**, down to 240p.
3. **Never upscale.** Nothing above the source is produced.

| Source | Renditions |
|---|---|
| 3840×2160 (4K) | **2160p**, 1440p, 1080p, 720p, 480p, 360p, 240p |
| 1920×1080 | **1080p**, 720p, 480p, 360p, 240p |
| 1280×720 | **720p**, 480p, 360p, 240p |
| 854×480 | **480p**, 360p, 240p |
| 1600×900 (non-standard) | **900p** (native), 720p, 480p, 360p, 240p |
| 1080×1920 (portrait phone) | **1080p**, 720p, 480p, 360p, 240p — each one portrait, undistorted |
| 320×180 (tiny) | **180p** only |

Standard rungs: **2160, 1440, 1080, 720, 480, 360, 240** (360p and 1440p are new; 360p is
the rung mobile networks live on). Labels follow YouTube: the *tier* of a video is the height of
the 16:9 box it fits in — `max(h, w × 9/16)` for landscape, the same with width/height swapped
for portrait — so a 1920×800 film is "1080p", not "800p", and a vertical 1080×1920 clip is
"1080p", not "1920p".

**"Original" means re-encoded at native resolution, not the uploaded file.** Uploads arrive
as HEVC, ProRes, VP9, 10-bit — much of which browsers cannot play. Re-encoding the top rung to
H.264 at the source's size keeps every pixel and plays everywhere. The raw file stays in the
raw bucket (`DATABASE_DESIGN.md` §9 retention).

**Contract change (additive).** `video.uploaded.resolutions` becomes an optional **cap**: if
present the transcoder intersects it with what the source allows, so it can never request an
upscale. The backend stops sending its fixed four-item list. Nothing else changes: the
`/processed` callback, `hlsMasterPath` and the frontend's `playback.ts` are untouched — the
player reads the renditions from `master.m3u8`.

**What 4K costs — the trade-offs, written down:**

| | Effect | Handled by |
|---|---|---|
| Encode time | 7 renditions instead of 4, the top one ~4× the pixels of 1080p. A 10-minute 4K upload can take tens of minutes on one machine | `-preset veryfast` (today: the slow default `medium`); Phase 3b parallel rungs |
| **Kafka eviction** | A job longer than `sessionTimeout` (30 s) gets the consumer evicted mid-encode → the video is transcoded twice (§6.1) | **heartbeat from FFmpeg progress — pulled forward from Phase 2 into this phase**; 4K makes it certain, not theoretical |
| Storage | ~2–3× per 4K video | raw-bucket lifecycle (`ARCHITECTURE.md` §8.1) |
| Viewer bandwidth | A small player must not pull 4K | hls.js `capLevelToPlayerSize: true` (frontend player, Part V P1) |
| Upload size | A 4K phone clip can exceed **5 GB — the limit of one presigned PUT** | **deferred:** multipart presigned upload |
| HDR (iPhone 4K is usually HDR10/HLG) | Encoding 10-bit HDR to 8-bit H.264 without tone-mapping looks washed out | **deferred:** detect HDR and tone-map; until then it plays, with flat colour — recorded so it is not mistaken for a bug |

### LLD

```
src/services/probe.service.ts      probeSource(path) → SourceInfo   (ffprobe; bundled, FFPROBE_PATH override)
src/services/ladder.ts             buildLadder(source, cap?) → Rendition[]   ← pure, unit-tested
src/services/transcode.service.ts  probe → buildLadder → encode each → master from the actual sizes
```

```ts
interface SourceInfo {
  width: number; height: number;       // display size, after the rotation side-data is applied
  fps: number; durationSec: number;
  bitrateKbps?: number; hasAudio: boolean; codec: string; hdr: boolean;
}
interface Rendition {
  label: string;                       // "2160p", "900p"
  width: number; height: number;       // even, aspect-preserving, never above the source
  videoKbps: number; maxKbps: number; bufKbps: number;
  bandwidth: number;                   // for #EXT-X-STREAM-INF, video + audio
}
```

**Bitrates** (H.264, ≤30 fps; ×1.5 above 30 fps):

| Rung | 2160p | 1440p | 1080p | 720p | 480p | 360p | 240p |
|---|---|---|---|---|---|---|---|
| Video kbps | 14000 | 8000 | 5000 | 2800 | 1200 | 800 | 400 |

A non-standard native rung interpolates by pixel count between its neighbours. **No rung exceeds
the source's own bitrate** — re-encoding a 2 Mbps 1080p upload at 5 Mbps adds bytes, not
quality. Capped VBR: `-b:v`, `-maxrate` = 1.07×, `-bufsize` = 2×.

**FFmpeg per rendition** (changes from today in bold):

```
-vf scale=W:H                             (W×H computed by buildLadder — aspect kept, even)
-c:v libx264 -preset veryfast -profile:v high
-b:v … -maxrate … -bufsize …
-force_key_frames "expr:gte(t,n_forced*2)" -sc_threshold 0   ← keyframes aligned across renditions,
                                                                so ABR switches without a stall
-r <source fps, capped at 60>
-c:a aac -b:a 128k  (or -an when the source has no audio)
-hls_time 6 -hls_playlist_type vod -hls_flags independent_segments
```

`master.m3u8` lists renditions **highest first** with their real `RESOLUTION`, `BANDWIDTH`,
`FRAME-RATE` and `CODECS`, so hls.js starts sensibly and the quality menu reads correctly.

**Errors.** A source ffprobe cannot read, or with no video stream, is **permanent** → `FAILED`
with "unsupported or corrupt video" — retrying cannot fix it. A failure mid-encode is transient
(Phase 2 classification).

**Config.** `TRANSCODE_MAX_RUNG` (default `2160` — see question 1), `TRANSCODE_PRESET` (default
`veryfast`), `FFPROBE_PATH` (optional).

**Tests.** `buildLadder` over the table above plus 1920×800, 4:3, 60 fps and a source bitrate
lower than the rung; `master.m3u8` order and attributes; an end-to-end encode of synthetic 4K,
720p, 480p and portrait clips (FFmpeg `testsrc`) asserting the renditions produced and that
none is larger than the source.

### Phases

| Phase | Ships |
|---|---|
| **3a — the ladder** ✅ | probe + `buildLadder` + aspect-kept scaling + aligned keyframes + `veryfast`; heartbeat during encode; backend stops sending the fixed list. **Verify:** 4K → 7 renditions incl. 2160p; 480p → 3, none upscaled; portrait undistorted; a >30 s encode is not transcoded twice. **All four verified live**, plus 720p, 1600×900 → native 900p, and a `rotate=90` landscape clip → portrait. |
| **3b — speed** | one decode feeding every rendition (`split` filter) or a bounded parallel pool. |
| Frontend (Part V P1) | quality menu labels `2160p 4K`, `1440p HD`, `1080p HD`; `capLevelToPlayerSize`. |
| Deferred | multipart upload > 5 GB; HDR tone-mapping; 8K; HEVC/AV1 renditions. |

### What flows back to the backend

The `/processed` callback widened additively in 3a; the backend stores each field, and drops a
malformed one rather than rejecting the call (a 4xx is final to the transcoder):

| With | Field | Stored in |
|---|---|---|
| `READY` | `duration` — whole seconds, from the probe | `Video.duration` |
| `READY` | `resolutions` — `[{ label, width, height, bandwidth }]`, from the ladder | `Video.resolutions` |
| `FAILED` | `errorCode` — `CORRUPT_OR_UNSUPPORTED` (unreadable, no video stream, undecodable), `SOURCE_MISSING` (`NoSuchKey`), `GAVE_UP` (a transient failure outlasted its retries), `UNKNOWN` | `Video.metadata` = `{ error, errorCode }` |

The `errorCode` lets the UI say "this file looks corrupt — replace it" rather than "retry
processing". The backend now answers **404** for a callback about a video that no longer exists,
so a video deleted mid-transcode is dropped instead of redelivered forever.

### Poster frame

Every transcode also writes **`{videoId}/poster.jpg`**: one frame about 10% in (at least 1 s; a clip
shorter than that gets its middle frame), at most 1280 wide, aspect kept, rotation applied so a
portrait upload gets a portrait poster. It is uploaded with the HLS (`image/jpeg`) and served by the
same route, `/api/video-transcoder/hls/{videoId}/poster.jpg`. **No contract change** — the path is
deterministic. A poster failure is logged and never fails the transcode; videos transcoded before
3a have none (`404`), so the frontend keeps its generated cover as the fallback.

### Implementation notes (3a)

Decisions taken while building it, recorded so they are not re-litigated:

- **Near-standard sizes snap.** A tier within 2% of a standard rung takes that rung's name, so a
  1920×1088 or 1916×1076 source is "1080p" (at its own size) rather than a "1088p" plus a
  near-duplicate 1080p. Everything else follows the rule as written: 1366×768 is "768p" + 720p.
- **The cap** (`resolutions` in the event) keeps the rungs it names; a request above the top rung
  gets the top rung (so `["1080p"]` on a 480p upload yields 480p, never an upscale); a cap that
  names nothing producible is ignored rather than producing no video.
- **Display size** in the probe applies the sample aspect ratio as well as rotation (both the
  display-matrix side data and the older `rotate` tag, whose signs differ), so anamorphic sources
  come out square-pixel. ffprobe is run directly with JSON output: fluent-ffmpeg's `ffprobe()`
  parses the INI format, which flattens rotation side data into the stream.
- **CODECS** is read from each rendition's first encoded segment (`avc1.6400xx`, `mp4a.40.2`), not
  guessed; if that probe fails the attribute is omitted rather than wrong.
- **FFmpeg flags beyond the list above:** `-map 0:V:0` (the real video stream, never cover art),
  `-pix_fmt yuv420p` (8-bit 4:2:0 for browsers, needed for 10-bit sources) and `-ac 2` (stereo AAC;
  128 kbps across 5.1 sounds poor and multichannel AAC is patchy in MSE).
- **`BANDWIDTH`** is `maxrate + audio`. Measured on the 4K run, every rung's peak 6 s segment sits
  just under it (2160p: 14,986 kbps against 15,108,000 declared).
- **Timing on the dev machine** (Apple Silicon, `veryfast`): a 60 s 4K30 upload took 72 s in
  `TRANSCODING` for all seven rungs, with one consumer and no rebalance.
- **Labels are directory names** (`2160p/playlist.m3u8`), so a rendition's URI is derivable from
  `Video.resolutions` alone.

### Questions for you

*(Answered — see the status line at the top of §7.1.)*

1. **Highest rung: 2160p (4K)?** An 8K upload would then top out at 2160p. Recommended — 8K
   costs ~4× 4K to encode and almost no viewer can display it.
2. **Non-standard sizes** (e.g. 1600×900): keep a **native 900p** top rung (recommended — it is
   what "original quality" means), or snap down to 720p?
3. **Encode speed vs size:** `veryfast` (recommended locally — roughly 2–3× faster than today)
   or `medium` (≈10–15% smaller files, slower)?

## 8. HTTP surface

| Route | Purpose |
|---|---|
| `GET /health` | `{ status: "healthy" }`. Registered **before** `express.json()`, so a malformed body cannot affect it |
| `GET /ready` | `200 { ready: true }` while this instance is in the consumer group, else `503` (Phase 2) |
| `GET /api/video-transcoder/hls/*` | S3 passthrough: path normalised, traversal rejected, `Range`/`Content-Range`/`Accept-Ranges` forwarded, `NoSuchKey` → 404. **Removed in P1** (§4.1) |

CORS on the HLS mount is restricted to `CORS_ALLOW_ORIGIN` (default
`http://localhost:3000`), methods `GET`/`HEAD`/`OPTIONS`, allowing `Range`.

`/health` is liveness only. **Readiness should additionally report consumer
group membership**, because a process that is listening but detached from Kafka
is doing no work while looking perfectly healthy — Phase 2.

## 8.1 Protecting the stream — proposed, awaiting review

> **Status: proposed.** Found by the security review (`docs/security-review.md`):
> `GET /api/video-transcoder/hls/{videoId}/…` needs **no credentials**, so anyone holding a
> lesson's id can play a paid course. Ids are random UUIDs and are only handed to people with
> access — but a buyer can share one, and it then works for anyone, forever.

**Decision: a short-lived signed playback cookie, checked by the transcoder without calling
anyone.**

1. When a viewer with access loads a course (`GET /api/v1/courses/:id` with
   `canAccessVideos`), the backend also sets `ls_play`: an HMAC-signed value
   `{ sub, courseId, videoIds[], exp: now + 2 h }` under a new `PLAYBACK_SECRET` shared with the
   transcoder. `HttpOnly; SameSite=Lax; Secure` in production; `Domain` is the parent domain the
   app and the media host share (locally every port of `localhost` already shares cookies).
2. The transcoder verifies the signature and expiry on every HLS request and that the requested
   `{videoId}` is in `videoIds`. Pure CPU — no database, no backend call per segment. Missing or
   invalid → `401`; valid but another course's video → `403`.
3. hls.js sends it with `xhrSetup: xhr.withCredentials = true`; the HLS CORS policy moves from
   `*`-capable to an explicit origin list with `credentials: true`. Safari's native player sends
   same-site cookies with media requests as it is.
4. The course page refreshes the cookie with its course reload, so a long lesson never outlives
   its token mid-play (2 h ≫ the 6 s segments).

**Rejected:**
- **Token in the URL** — HLS segment URIs are relative, so a query token is lost unless every
  playlist is rewritten per request, and Safari's native player cannot add one.
- **Ask the backend per request** — one HLS lesson is hundreds of segment requests.

**It carries over to the CDN (Phase 4):** CloudFront signed cookies have the same shape (a
signed policy scoped to `/{videoId}/*` with an expiry), so the frontend change is made once.

**Phases:** P-1 backend cookie + transcoder check + player credentials, with the security probe
asserting `401` anonymous / `403` for another course / `200` with access; P-2 move the check to
CloudFront signed cookies with Phase 4.

## 9. The outbound callback

`POST {BACKEND_API_URL}/api/v1/video-upload/{videoId}/processed`, header
`X-Transcoder-Api-Key`.

```ts
export interface MarkProcessedPayload {
  status: 'TRANSCODING' | 'READY' | 'FAILED';
  hlsMasterPath?: string;
  error?: string;
}
```

Called three times per job: `TRANSCODING` on pickup, then `READY` with
`hlsMasterPath` or `FAILED` with `error`. **Widened additively in 3a:**
`duration` and `resolutions` with `READY`, `errorCode` with `FAILED` — §7.1.

### 9.1 What is missing from it

- **No retry.** A non-2xx throws. If the backend is restarting at that moment,
  the work is complete in S3 and the row never leaves `UPLOADED`. This needs
  bounded retry with backoff; and because the terminal callback is the *only*
  record of success, it deserves more persistence than the encode itself.
- **No fail-fast on a missing key** — §4.2 ②.
- **`BACKEND_API_URL` defaults to `http://localhost:5001`** while the backend
  defaults to `5000` (§12.1).

### 9.2 Proposed widening, if per-rung progress is wanted

```ts
{
  status: 'TRANSCODING' | 'READY' | 'FAILED',
  hlsMasterPath?: string,
  error?: string,
  jobs?: Array<{                       // optional; additive
    resolution: string,                // "720p"
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    outputKey?: string,
    progress?: number,                 // 0-100
    error?: string,
  }>
}
```

Additive and optional, so the backend can ignore it until it is ready. This is
what populates `VideoTranscodeJob` **without** reintroducing a second database
writer, and it is the thing that makes a real progress bar possible in the UI.

## 10. Scaling

| Dimension | Today | Ceiling | Fix |
|---|---|---|---|
| Concurrent jobs | 1 process, rungs sequential | 1 × 4 passes | replicas ≤ partitions; then rung-level parallelism |
| Partitions on `video.uploaded` | **3** | 3 consumers | raise partitions first — consumers above the partition count sit idle |
| CPU per job | 4 sequential FFmpeg passes | — | parallel rungs, then `-preset` tuning |
| Playback bandwidth | through this process | single-process NIC and CPU | **CDN (§4.1)** — this is the real ceiling today |
| Temp disk | `/tmp/video-transcode/{jobId}` | node disk | cleanup exists; add a startup sweep for orphans left by a crash |

**The ordering matters:** raising replicas before §4.2 ① is fixed multiplies
silently-lost work rather than throughput. Reliability first, then parallelism.

Beyond that, two triggers worth naming now:
- **Scale on consumer lag** (KEDA or equivalent) rather than CPU — a queue of
  waiting uploads is the signal, not the CPU of a worker that is already busy.
- **Managed transcoding** (MediaConvert) becomes the right answer when the
  encode bill exceeds the cost of operating this pool. Recorded so it is a
  decision rather than a surprise.

## 11. Testing

**Status:** unit tests exist (`npm test`, Node's built-in `node:test` rather than
Vitest — no Babel and no extra dependency): config validation, job retry and
failure codes, the callback, the ladder over every §7.1 row, the master
playlist and encoder flags, and probe and poster checks against the real bundled
binaries. The integration and contract rows below are still to do.

Proposal, deliberately small:

| Level | What |
|---|---|
| Unit | `master.m3u8` generation — **every `#EXT-X-STREAM-INF` followed by its URI**, correct `BANDWIDTH` and `RESOLUTION`; the HLS path normaliser against traversal attempts (`../`, absolute, encoded); the key/prefix helpers |
| Unit | error classification (§4.2 ①) — each known failure maps to retry or `FAILED` |
| Integration | `s3.service` against LocalStack: upload a directory tree, read it back with a `Range` request |
| Integration | one 3-second fixture clip end to end: download → single rung → upload → callback, with the backend stubbed. Fast enough for CI |
| Contract | a `VideoTranscodeMessage` fixture shared with the backend's producer test, so the contract cannot drift silently |

Vitest, for the same reason as the frontend: no Babel against ESM.

## 12. Configuration

| Key | Default | Note |
|---|---|---|
| `PORT` | `7000` | §12.1 |
| `KAFKA_BROKERS` | `localhost:9092` | comma-separated |
| `KAFKA_CLIENT_ID` | `video-transcode-service` | |
| `KAFKA_TOPIC_VIDEO_TRANSCODE` | `video.uploaded` | must match the producer |
| `LOCAL_STACK_DATA_SOURCE` | — | `true` → LocalStack, path-style, `test`/`test` |
| `LOCALSTACK_ENDPOINT` | `http://localhost:4566` | |
| `AWS_REGION` | `us-east-1` | |
| `S3_RAW_VIDEO_BUCKET` / `S3_PROCESSED_VIDEO_BUCKET` | — | **required in practice**; a missing processed bucket is only discovered at request time |
| `BACKEND_API_URL` | `http://localhost:5001` | §12.1 |
| `TRANCODER_API_KEY` | — | **misspelled consistently.** Match it. Should be required at startup — §4.2 ② |
| `CORS_ALLOW_ORIGIN` | `http://localhost:3000` | |
| `TRANSCODE_MAX_RUNG` | `2160` | tallest rung produced (§7.1); whole number ≥ 240, checked at startup |
| `TRANSCODE_PRESET` | `veryfast` | x264 preset; checked at startup |
| `FFMPEG_PATH`, `FFPROBE_PATH` | bundled | a system binary instead of `@ffmpeg-installer` / `@ffprobe-installer` |
| `DATABASE_URL` | — | **removed** in Phase 1 (§4.3) |
| `SQS_QUEUE_URL`, `SQS_ENDPOINT` | — | configured; unused here |

**FFmpeg must be on `PATH`** or resolvable via `@ffmpeg-installer/ffmpeg`.
It fails at runtime, not at startup — which should also be a startup check.

### 12.1 The port disagreement

This service defaults to `7000`; `frontend/src/config/env.ts` defaults
`transcoderUrl` to `:7070`. Separately, `BACKEND_API_URL` here defaults to
`:5001` while the backend defaults to `5000`. Two different off-by-one-service
mismatches, both hidden by env vars normally being set. Settle them in one
change across `.env.example`, `frontend/src/config/env.ts`, the README and
`deploy/lms-deployment.yaml` — `../ARCHITECTURE.md` §9.

---

# Part III — Phases

Each phase leaves the service running and is independently reviewable.

### Phase 1 — delete the dead weight, fail fast
**Status: ✅ done.** `db.service.ts`, `prisma/`, `src/utils/transcode.js` and
`DATABASE_URL` are gone; `src/config/validate.ts` refuses to start without the
key, the buckets or an executable FFmpeg (and, since 3a, FFprobe).

Remove `src/services/db.service.ts`, `prisma/`, the `postinstall`
`prisma generate` and `DATABASE_URL`; resolve `src/utils/transcode.js` vs the TS
source; require `TRANCODER_API_KEY`, both S3 buckets and FFmpeg **at startup**
and exit if any is missing (§4.2 ②).
**Verify:** `npm run build` clean; the service refuses to start without the key;
a full upload → `READY` still works.
**Why first:** it is subtraction only, and it removes the silent-success failure
mode before anything else is changed.

### Phase 2 — make the consumer honest
**Status: ✅ done.** `src/services/job.service.ts`: transient failures retried in
place (3 attempts, backoff), permanent ones reported `FAILED` once, a 5 s Kafka
heartbeat during the job, callback retry with backoff, `/ready` on group
membership. The >30 s no-rebalance check was run in 3a with a 72 s 4K job.

Classify transient vs permanent (§4.2 ①): rethrow transient so Kafka
redelivers, mark permanent `FAILED`, bound the retry count. Heartbeat from the
FFmpeg progress callback (§6.1). Bounded retry with backoff on the callback
(§9.1). Readiness reporting consumer-group membership (§8).
**Verify:** kill the backend mid-job and watch the callback recover; feed a
corrupt file and watch it land `FAILED` **once**, not loop; run an encode longer
than `sessionTimeout` without a rebalance.
**This is the prerequisite for running more than one replica.**

### Phase 3 — output quality and parallelism
**Status: 3a ✅ done and verified live (2026-10-09); 3b not started.**
**Superseded in detail by §7.1** (source-aware ladder: 3a ladder, 3b speed). Portrait and 4:3
sources are kept undistorted by computing each rendition's size there — no `pad`, the player
letterboxes. Encode rungs in parallel with a bounded worker count.
Optionally the `jobs[]` callback widening (§9.2) so progress is real.
**Verify:** a portrait upload plays undistorted; a 10-minute video completes
measurably faster; the master playlist still passes the Phase-1 unit test.

### Phase 4 — stop serving bytes
CloudFront in front of `s3://processed-videos`, signed URLs or cookies; remove
the HLS mount; `frontend/lib/playback.ts` points at the CDN. Once this lands,
"Kafka down but still serving" is no longer a reason to keep the process alive
on a broker failure (§3) — revisit that default here.
**Verify:** playback works with the HLS route deleted; a signed URL expires as
expected.
**This is P1 in the roadmap and the single highest-leverage change available.**

### Phase 5 — tests
§11, in that order. Honestly placed here rather than at the front: Phases 1–3
change the behaviour the tests would pin, so writing them first would mostly
mean rewriting them. The exception is the `master.m3u8` unit test, which is
stable and lands in Phase 1.

### Deferred, recorded so it is not silently re-litigated
Thumbnails and sprite sheets, subtitle extraction, DRM, per-title encoding,
AV1/HEVC, managed transcoding (trigger in §10), DASH.

---

## 13. Open questions

1. **Is per-resolution progress wanted?** If yes, §9.2 widens the callback and
   `VideoTranscodeJob` finally gets rows. If no, drop the table in the next
   migration. My preference is yes — it is what makes a real progress bar
   possible — but it is only worth it alongside Phase 3's parallelism.
2. **Phase 4 before or after commerce?** It is the biggest scalability win and
   touches only this service plus one frontend file, but it needs CloudFront set
   up. Commerce is the revenue path. I would do commerce first and Phase 1–2
   here meanwhile, since those are cheap and remove real failure modes.
3. **Signed URLs or signed cookies for CDN playback?** Cookies are simpler for a
   multi-segment HLS stream (one credential for the whole playlist); URLs are
   easier to scope per video. Leaning cookies, scoped to the `{videoId}/` path.
4. **Retry budget for a transient failure?** I would suggest 3 attempts with
   backoff, then `FAILED` with the attempt count in `error` so support can tell
   "this file is broken" from "we gave up".
5. **Do we keep the raw upload after a successful transcode?**
   `../DATABASE_DESIGN.md` §9 proposes 30 days then lifecycle out. Confirm —
   re-encoding later (a new rung, a better preset) is the only reason to keep it,
   and it is a good reason.
