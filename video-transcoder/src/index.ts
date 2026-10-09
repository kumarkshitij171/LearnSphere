import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config/conf.js";
import { ffmpegPath, ffprobePath } from "./config/ffmpeg.js";
import { configProblems } from "./config/validate.js";
import { logger } from "./utils/logger.js";
import {
  startKafkaConsumer,
  disconnectKafkaConsumer,
  isConsumerReady,
  type MessageHandler,
} from "./services/kafka.service.js";
import { processTranscodeMessage } from "./services/job.service.js";
import { sweepStaleJobDirs } from "./services/temp.service.js";
import { transcodeVideo } from "./services/transcode.service.js";
import { getS3ObjectStream } from "./services/s3.service.js";
import { markVideoProcessed } from "./services/backend-api.service.js";

// fail at boot, not on the first upload: a missing key used to skip the callback silently
const problems = configProblems(process.env, { FFmpeg: ffmpegPath, FFprobe: ffprobePath });
if (problems.length) {
  for (const p of problems) logger.error(`Config: ${p}`);
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
const PORT: number = Number(config.port) || 7000;

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "healthy" });
});

// readiness: only an instance that is in the consumer group is doing its job
app.get("/ready", (_req, res) => {
  const ready = isConsumerReady();
  res.status(ready ? 200 : 503).json({ ready });
});

app.use(express.json());

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || "http://localhost:3000";
const hlsCors = cors({
  origin: corsOrigin === "*" ? "*" : corsOrigin.split(",").map((o) => o.trim()),
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Range"],
});

app.use("/api/video-transcoder/hls", hlsCors);

// Serve HLS (master/variant playlists + .ts segments) straight from the
// processed-video S3 bucket. Key = the path after the mount, e.g.
// `{videoId}/master.m3u8`. Relative refs inside the playlists resolve under
// this same base, so segment requests map back to `{videoId}/...` keys.
app.use("/api/video-transcoder/hls", async (req, res) => {
  const requestedPath =
    decodeURIComponent((req.url || "").replace(/^\//, "").replace(/\?.*$/, "")) || "master.m3u8";
  const safePath = path.posix.normalize(requestedPath).replace(/^(\.\.(\/|\\))+/, "");
  if (safePath.startsWith("..") || path.posix.isAbsolute(safePath)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const bucket = config.s3?.processedVideoBucket;
  if (!bucket) {
    return res.status(500).json({ error: "Processed video bucket not configured" });
  }

  try {
    const obj = await getS3ObjectStream(bucket, safePath, req.headers.range);
    res.status(obj.statusCode);
    res.setHeader("Content-Type", obj.contentType);
    if (obj.contentLength != null) res.setHeader("Content-Length", String(obj.contentLength));
    if (obj.acceptRanges) res.setHeader("Accept-Ranges", obj.acceptRanges);
    if (obj.contentRange) res.setHeader("Content-Range", obj.contentRange);
    obj.body.on("error", (err) => {
      logger.error("HLS stream error", { key: safePath, err });
      if (!res.headersSent) res.status(500).json({ error: "Stream error" });
      else res.destroy();
    });
    obj.body.pipe(res);
  } catch (err: any) {
    const code = err?.name || err?.Code;
    if (code === "NoSuchKey" || code === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: "Not found" });
    }
    logger.error("Failed to fetch HLS object from S3", { key: safePath, err: err?.message });
    return res.status(500).json({ error: "Internal error" });
  }
});

const handleTranscodeMessage: MessageHandler = (message, heartbeat) =>
  processTranscodeMessage(message, {
    transcode: transcodeVideo,
    report: markVideoProcessed,
    heartbeat,
  });

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let stopping = false;

// Keep trying: a broker that is not up yet at boot must not leave the service running idle forever.
// HLS keeps being served meanwhile.
const startService = async (): Promise<void> => {
  sweepStaleJobDirs();
  setInterval(() => sweepStaleJobDirs(), 60 * 60 * 1000).unref();
  logger.info("Starting Video Transcoding Service...", {
    kafkaBrokers: config.kafka.brokers,
    kafkaTopic: config.kafka.topicVideoTranscode,
    s3RawBucket: config.s3?.rawVideoBucket,
    s3ProcessedBucket: config.s3?.processedVideoBucket,
  });
  for (let delay = 2000; !stopping; delay = Math.min(delay * 2, 30000)) {
    try {
      await startKafkaConsumer(handleTranscodeMessage);
      logger.info("Video Transcoding Service started successfully");
      return;
    } catch (error) {
      logger.warn(`Kafka consumer not started, retrying in ${delay}ms: ${(error as Error)?.message}`);
      await disconnectKafkaConsumer();
      await sleep(delay);
    }
  }
};

app.listen(PORT, () => {
  logger.info(`HTTP server running on http://localhost:${PORT}`);
});

startService();

process.on("SIGINT", async () => {
  stopping = true;
  logger.info("Shutting down gracefully...");
  try {
    await disconnectKafkaConsumer();
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", { error });
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  stopping = true;
  logger.info("Shutting down gracefully...");
  try {
    await disconnectKafkaConsumer();
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", { error });
    process.exit(1);
  }
});
