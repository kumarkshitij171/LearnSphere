import express from "express";
import cors from "cors";
import path from "path";
import { config } from "./config/conf.js";
import { logger } from "./utils/logger.js";
import {
  startKafkaConsumer,
  disconnectKafkaConsumer,
  type VideoTranscodeMessage,
} from "./services/kafka.service.js";
import { transcodeVideo } from "./services/transcode.service.js";
import { getS3ObjectStream } from "./services/s3.service.js";
import { markVideoProcessed } from "./services/backend-api.service.js";

const app = express();
const PORT: number = Number(config.port) || 7000;

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "healthy" });
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

/**
 * Handle video transcode messages from Kafka (topic: video.uploaded).
 * Backend sends: videoId, userId, bucket, key, resolutions.
 */
const handleTranscodeMessage = async (
  message: VideoTranscodeMessage
): Promise<void> => {
  const { bucket, key, videoId, resolutions = ['240p', '480p', '720p', '1080p'] } = message;

  if (!videoId) {
    logger.error("Message missing videoId");
    return;
  }

  try {
    logger.info(`Processing video transcode job: videoId=${videoId} bucket=${bucket} key=${key}`);

    // Notify backend: status = TRANSCODING
    await markVideoProcessed(videoId, { status: 'TRANSCODING' });

    const result = await transcodeVideo({
      bucket,
      key,
      videoId,
      resolutions,
    });

    if (result.success && result.hlsMasterPath) {
      await markVideoProcessed(videoId, {
        status: 'READY',
        hlsMasterPath: result.hlsMasterPath,
      });
      logger.info(`Successfully completed transcoding for: ${videoId}`);
    } else {
      await markVideoProcessed(videoId, {
        status: "FAILED",
        error: result.error || "Transcoding failed",
      });
      logger.error(`Failed to transcode video: ${videoId}`, { error: result.error });
    }
  } catch (error: any) {
    logger.error("Error handling transcode message", { error: error?.message, videoId });
    try {
      await markVideoProcessed(videoId, {
        status: "FAILED",
        error: error?.message || "Unknown error",
      });
    } catch (apiError) {
      logger.error("Failed to notify backend", { apiError });
    }
  }
};

/**
 * Start the transcoding service
 */
const startService = async (): Promise<void> => {
  try {
    logger.info("Starting Video Transcoding Service...", {
      kafkaBrokers: config.kafka.brokers,
      kafkaTopic: config.kafka.topicVideoTranscode,
      s3RawBucket: config.s3?.rawVideoBucket,
      s3ProcessedBucket: config.s3?.processedVideoBucket,
    });

    try {
      await startKafkaConsumer(handleTranscodeMessage);
      logger.info("Video Transcoding Service started successfully");
    } catch (kafkaError) {
      logger.warn(
        "Kafka connection failed. Service will continue running; HTTP endpoints are still available."
      );
    }
  } catch (error) {
    logger.error("Failed to start service", { error });
    if (error instanceof Error && !error.message.includes("Kafka")) {
      process.exit(1);
    }
  }
};

app.listen(PORT, () => {
  logger.info(`HTTP server running on http://localhost:${PORT}`);
});

startService().catch((error) => {
  logger.error("Fatal error starting service", { error });
  process.exit(1);
});

process.on("SIGINT", async () => {
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
