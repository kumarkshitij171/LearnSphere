import { Kafka } from 'kafkajs';
import type { Consumer } from 'kafkajs';
import { config } from '../config/conf.js';
import { logger } from '../utils/logger.js';

// Initialize Kafka client
const kafka = new Kafka({
  clientId: config.kafka.clientId || 'video-transcode-service',
  brokers: config.kafka.brokers?.split(',') || ['localhost:9092'],
  retry: {
    initialRetryTime: 100,
    retries: 3, // Reduced retries for faster failure detection
  },
  connectionTimeout: 5000, // 5 second timeout
  requestTimeout: 30000,
});

// Create admin client for topic management
const admin = kafka.admin();

// Create consumer instance
export const kafkaConsumer: Consumer = kafka.consumer({
  groupId: 'video-transcode-consumer-group',
  sessionTimeout: 30000,
  heartbeatInterval: 3000,
});

/**
 * Ensure topic exists, create if it doesn't
 */
const ensureTopicExists = async (topic: string): Promise<void> => {
  try {
    await admin.connect();
    
    const topics = await admin.listTopics();
    
    if (!topics.includes(topic)) {
      logger.info(`Creating topic: ${topic}`);
      await admin.createTopics({
        topics: [{
          topic: topic,
          numPartitions: 3,
          replicationFactor: 1,
        }],
      });
      logger.info(`Topic created: ${topic}`);
    } else {
      logger.info(`Topic already exists: ${topic}`);
    }

    await admin.disconnect();
  } catch (error: any) {
    logger.warn(`Could not ensure topic exists: ${error.message}`);
    // Don't throw - topic might be auto-created when first message is sent
    try {
      await admin.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
};

/** Matches backend event: video.uploaded */
export interface VideoTranscodeMessage {
  videoId: string;
  userId: string;
  bucket: string;
  key: string;
  inputS3Path?: string;
  resolutions?: string[];
  size?: number;
  timestamp?: string;
}

/**
 * Start Kafka consumer to listen for video transcode messages
 */
let consumerReady = false;
/** True while this instance is a member of the consumer group; reported by /ready. */
export const isConsumerReady = (): boolean => consumerReady;
kafkaConsumer.on(kafkaConsumer.events.GROUP_JOIN, () => {
  consumerReady = true;
});
for (const event of [kafkaConsumer.events.CRASH, kafkaConsumer.events.DISCONNECT, kafkaConsumer.events.STOP]) {
  kafkaConsumer.on(event, () => {
    consumerReady = false;
  });
}

export type MessageHandler = (message: VideoTranscodeMessage, heartbeat: () => Promise<void>) => Promise<void>;

export const startKafkaConsumer = async (messageHandler: MessageHandler): Promise<void> => {
  const brokers = config.kafka.brokers?.split(',') || ['localhost:9092'];
  const topic = config.kafka.topicVideoTranscode || 'video.uploaded';
  
  logger.info(`Attempting to connect to Kafka brokers: ${brokers.join(', ')}`);

  try {
    await Promise.race([
      kafkaConsumer.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout after 10 seconds')), 10000)
      ),
    ]);

    logger.info('Kafka consumer connected');

    // Ensure topic exists before subscribing
    await ensureTopicExists(topic);

    // Small delay to ensure topic is ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    await kafkaConsumer.subscribe({
      topic: topic,
      fromBeginning: false,
    });

    logger.info(`Subscribed to topic: ${topic}`);

    await kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        const messageValue = message.value?.toString();
        let data: VideoTranscodeMessage;
        try {
          if (!messageValue) throw new Error('empty message');
          data = JSON.parse(messageValue);
        } catch (error) {
          // unreadable now means unreadable forever; redelivering it would only stall the partition
          logger.error(`Dropping unreadable message at ${topic}[${partition}]@${message.offset}`, { error });
          return;
        }
        logger.info(`Received message from ${topic}[${partition}]`, { videoId: data.videoId, key: data.key });
        // a throw here is deliberate: kafkajs retries and does not commit, so the outcome is never lost
        await messageHandler(data, heartbeat);
      },
    });

    logger.info('Kafka consumer started and listening for messages');
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    logger.error('Failed to connect to Kafka', {
      error: errorMessage,
      brokers: brokers.join(', '),
    });
    logger.info('To start Kafka locally: docker-compose up -d kafka (Kafka UI: http://localhost:8080)');
    throw error;
  }
};

/**
 * Gracefully disconnect Kafka consumer
 */
export const disconnectKafkaConsumer = async (): Promise<void> => {
  try {
    await kafkaConsumer.disconnect();
    logger.info('Kafka consumer disconnected');
  } catch (error) {
    logger.error('Error disconnecting Kafka consumer', { error });
  }
};
