import { Kafka, Producer } from 'kafkajs';

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
export const kafka = new Kafka({
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
  // optional cap; when absent the transcoder builds the ladder from the source itself
  resolutions?: string[];
}

const TOPIC_VIDEO_UPLOADED = process.env.KAFKA_TOPIC_VIDEO_UPLOADED || 'video.uploaded';
const TOPIC_PARTITIONS = Number(process.env.KAFKA_TOPIC_PARTITIONS) || 3;

let topicsEnsured = false;

// Pre-creates the topic and waits for its partition leader so the first
// produce never races topic auto-creation ("does not host this topic-partition").
export const ensureKafkaTopics = async (): Promise<void> => {
  if (topicsEnsured) return;
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      topics: [{ topic: TOPIC_VIDEO_UPLOADED, numPartitions: TOPIC_PARTITIONS }],
      waitForLeaders: true,
    });
    topicsEnsured = true;
    console.log(`[Kafka] Ensured topic '${TOPIC_VIDEO_UPLOADED}' (${TOPIC_PARTITIONS} partition(s))`);
  } finally {
    await admin.disconnect();
  }
};

export const getKafkaProducer = async (): Promise<Producer> => {
  if (producer) return producer;
  await ensureKafkaTopics();
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
            ...(event.resolutions && { resolutions: event.resolutions }),
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
