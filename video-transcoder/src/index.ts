import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "./config/conf.js";
import { logger } from "./utils/logger.js";
import {
  startKafkaConsumer,
  disconnectKafkaConsumer,
  type VideoTranscodeMessage,
} from "./services/kafka.service.js";
import { transcodeVideo } from "./services/transcode.service.js";
import { markVideoProcessed } from "./services/backend-api.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT: number = Number(config.port) || 7000;

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "healthy" });
});

app.use(express.json());

const hlsTestDir = path.resolve(__dirname, "..", "src", "constants", "out", "hls");

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || "http://localhost:3000";
const hlsCors = cors({
  origin: corsOrigin === "*" ? "*" : corsOrigin.split(",").map((o) => o.trim()),
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Range"],
});

function contentTypeFor(filename: string): string {
  if (filename.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (filename.endsWith(".ts")) return "video/MP2T";
  return "application/octet-stream";
}

app.use("/api/video-transcoder/hls", hlsCors);

app.use("/api/video-transcoder/hls", (req, res) => {
  const requestedPath = (req.url || "").replace(/^\//, "").replace(/\?.*$/, "") || "master.m3u8";
  const safePath = path.normalize(requestedPath).replace(/^(\.\.(\/|\\))+/, "");
  const filePath = path.resolve(path.join(hlsTestDir, safePath));
  const rootDir = path.resolve(hlsTestDir);
  if (!filePath.startsWith(rootDir) || path.relative(rootDir, filePath).startsWith("..")) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: "Not found" });
  }
  res.setHeader("Content-Type", contentTypeFor(path.basename(filePath)));
  res.sendFile(filePath);
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
