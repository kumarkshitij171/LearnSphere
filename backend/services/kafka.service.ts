import { Kafka, Producer } from 'kafkajs';

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'lms-backend',
  brokers,
});

let producer: Producer | null = null;

export interface VideoUploadedEvent {
  videoId: string;
  userId: string;
  bucket: string;
  key: string;
  inputS3Path: string;
  resolutions: string[];
}

const TOPIC_VIDEO_UPLOADED = process.env.KAFKA_TOPIC_VIDEO_UPLOADED || 'video.uploaded';

export const getKafkaProducer = async (): Promise<Producer> => {
  if (producer) return producer;
  producer = kafka.producer();
  await producer.connect();
  return producer;
};

export const publishVideoUploaded = async (event: VideoUploadedEvent): Promise<void> => {
  try {
    const p = await getKafkaProducer();
    await p.send({
      topic: TOPIC_VIDEO_UPLOADED,
      messages: [
        {
          key: event.videoId,
          value: JSON.stringify({
            videoId: event.videoId,
            userId: event.userId,
            bucket: event.bucket,
            key: event.key,
            inputS3Path: event.inputS3Path,
            resolutions: event.resolutions,
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });
    console.log(`[Kafka] Published video.uploaded for videoId=${event.videoId}`);
  } catch (error) {
    console.error('[Kafka] Failed to publish video.uploaded:', error);
    throw error;
  }
};

export const disconnectKafkaProducer = async (): Promise<void> => {
  if (producer) {
    await producer.disconnect();
    producer = null;
    console.log('[Kafka] Producer disconnected');
  }
};
