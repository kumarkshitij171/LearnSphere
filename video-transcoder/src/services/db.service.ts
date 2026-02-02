import { PrismaClient } from "@prisma/client";
import { config } from '../config/conf.js';

// Initialize Prisma client
// Prisma will automatically use DATABASE_URL from environment variables
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export interface VideoUpdateData {
  videoId?: string;
  originalKey: string;
  resolutions: Array<{
    resolution: string;
    key: string;
    size?: number;
  }>;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

/**
 * Find video by S3 key
 */
export const findVideoByKey = async (key: string) => {
  try {
    const video = await prisma.video.findFirst({
      where: {
        originalKey: key,
      },
      include: {
        transcodeJobs: true,
      },
    });
    return video;
  } catch (error) {
    console.error('❌ Error finding video by key:', error);
    throw error;
  }
};

/**
 * Update video status and resolutions in database
 */
export const updateVideoStatus = async (data: VideoUpdateData): Promise<void> => {
  try {
    const { videoId, originalKey, resolutions, status, error } = data;

    // Find video by key if videoId not provided
    let video = null;
    if (videoId) {
      video = await prisma.video.findUnique({
        where: { id: videoId },
      });
    } else {
      video = await findVideoByKey(originalKey);
    }

    if (!video) {
      console.warn(`⚠️ Video not found for key: ${originalKey}`);
      return;
    }

    // Update video status
    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: status,
        resolutions: resolutions as any,
        ...(error && { metadata: { error } }),
      },
    });

    // Create or update transcode jobs
    for (const res of resolutions) {
      const existingJob = await prisma.videoTranscodeJob.findFirst({
        where: {
          videoId: video.id,
          resolution: res.resolution,
        },
      });

      if (existingJob) {
        await prisma.videoTranscodeJob.update({
          where: { id: existingJob.id },
          data: {
            status: status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
            outputKey: res.key,
            progress: status === 'COMPLETED' ? 100 : 50,
            ...(error && { error }),
          },
        });
      } else {
        await prisma.videoTranscodeJob.create({
          data: {
            videoId: video.id,
            resolution: res.resolution,
            status: status === 'COMPLETED' ? 'COMPLETED' : 'PROCESSING',
            inputKey: originalKey,
            outputKey: res.key,
            progress: status === 'COMPLETED' ? 100 : 50,
            ...(error && { error }),
          },
        });
      }
    }

    console.log(`✅ Video status updated: ${video.id} -> ${status}`);
  } catch (error) {
    console.error('❌ Error updating video status:', error);
    throw error;
  }
};

/**
 * Mark video as processing
 */
export const markVideoAsProcessing = async (key: string, videoId?: string): Promise<void> => {
  try {
    let video = null;
    if (videoId) {
      video = await prisma.video.findUnique({
        where: { id: videoId },
      });
    } else {
      video = await findVideoByKey(key);
    }

    if (!video) {
      console.warn(`⚠️ Video not found for key: ${key}`);
      return;
    }

    await prisma.video.update({
      where: { id: video.id },
      data: {
        status: 'PROCESSING',
      },
    });

    console.log(`✅ Video marked as processing: ${video.id}`);
  } catch (error) {
    console.error('❌ Error marking video as processing:', error);
    throw error;
  }
};

/**
 * Disconnect Prisma client
 */
export const disconnectDB = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error disconnecting database:', error);
  }
};
