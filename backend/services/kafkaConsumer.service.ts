import { Consumer, EachMessagePayload } from 'kafkajs';
import { kafka } from './kafka.service';
import { grantFromOrder, revokeFromOrder } from './course.service';

const TOPIC_ORDER_PAID = process.env.KAFKA_TOPIC_ORDER_PAID || 'order.paid';
const TOPIC_ORDER_REFUNDED = process.env.KAFKA_TOPIC_ORDER_REFUNDED || 'order.refunded';
const GROUP_ID = process.env.KAFKA_CONSUMER_GROUP || 'lms-backend';

// The order-service contract (order-service/SYSTEM_DESIGN.md §6.2); only the fields used here.
export interface OrderEvent {
  eventId: string;
  eventType: string;
  orderId: string;
  userId: string;
  courseId: string;
  fullRefund?: boolean;
}

let consumer: Consumer | null = null;

const parse = (raw: string | undefined): OrderEvent | null => {
  if (!raw) return null;
  try {
    const event = JSON.parse(raw);
    return event?.orderId && event?.userId && event?.courseId ? (event as OrderEvent) : null;
  } catch {
    return null;
  }
};

// A malformed or unusable record is logged and skipped so it cannot wedge the partition. A
// database error is rethrown: kafkajs then retries and does not commit, so enrolment is
// retried until it succeeds rather than lost.
export const handleOrderEvent = async (topic: string, raw: string | undefined): Promise<void> => {
  const event = parse(raw);
  if (!event) {
    console.error(`[Kafka] Skipping malformed ${topic} record:`, raw);
    return;
  }

  if (topic === TOPIC_ORDER_PAID) {
    const result = await grantFromOrder(event.userId, event.courseId, event.orderId);
    if (!result.ok) {
      console.warn(`[Kafka] order.paid ${event.orderId} not granted: ${result.reason}`);
      return;
    }
    console.log(`[Kafka] Enrolled ${event.userId} in ${event.courseId} (order ${event.orderId})`);
    return;
  }

  if (topic === TOPIC_ORDER_REFUNDED) {
    // partial refunds keep access; only a full refund revokes it
    if (event.fullRefund === false) return;
    const result = await revokeFromOrder(event.userId, event.courseId, event.orderId);
    if (!result.ok) {
      console.warn(`[Kafka] order.refunded ${event.orderId} revoked nothing: ${result.reason}`);
      return;
    }
    console.log(`[Kafka] Revoked ${event.userId} from ${event.courseId} (order ${event.orderId})`);
  }
};

const startOnce = async (): Promise<void> => {
  const next = kafka.consumer({ groupId: GROUP_ID });
  try {
    await next.connect();
    await next.subscribe({ topics: [TOPIC_ORDER_PAID, TOPIC_ORDER_REFUNDED], fromBeginning: true });
    await next.run({
      eachMessage: async ({ topic, message }: EachMessagePayload) =>
        handleOrderEvent(topic, message.value?.toString()),
    });
  } catch (error) {
    await next.disconnect().catch(() => undefined);
    throw error;
  }
  consumer = next;
  console.log(`[Kafka] Consuming ${TOPIC_ORDER_PAID}, ${TOPIC_ORDER_REFUNDED} as ${GROUP_ID}`);
};

let stopping = false;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// kafkajs only reconnects a consumer that has started; on a fresh broker the first subscribe can
// fail (topics or __consumer_offsets not there yet), so keep trying instead of giving up for good.
export const startOrderEventsConsumer = async (
  { initialDelayMs = 2000, maxDelayMs = 30000 } = {}
): Promise<void> => {
  if (consumer) return;
  stopping = false;
  for (let delay = initialDelayMs; !stopping; delay = Math.min(delay * 2, maxDelayMs)) {
    try {
      await startOnce();
      return;
    } catch (error) {
      console.warn(`[Kafka] Order events consumer not started, retrying in ${delay}ms:`, (error as Error).message);
      await sleep(delay);
    }
  }
};

export const stopOrderEventsConsumer = async (): Promise<void> => {
  stopping = true;
  if (!consumer) return;
  await consumer.disconnect();
  consumer = null;
};
