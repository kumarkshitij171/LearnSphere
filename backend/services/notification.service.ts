import { createHash } from 'crypto';
import { getKafkaProducer } from './kafka.service';

// The backend sends no email itself: it publishes NotificationMessages that notification-service
// renders and delivers (notification-service/SYSTEM_DESIGN.md §6.2 — additive-only contract).
const TOPIC_NOTIFICATIONS = process.env.KAFKA_TOPIC_NOTIFICATIONS || 'notifications';
const TENANT_ID = process.env.TENANT_ID || 'learnsphere';

export interface NotificationMessage {
  notificationId: string;
  tenantId: string;
  userId: string;
  channels: Array<'EMAIL' | 'PUSH' | 'SMS'>;
  templateName: string;
  target: { email: string | null; phone: string | null; deviceTokens: string[] | null };
  variables: Record<string, string>;
  attempt: number;
}

export const publishNotification = async (message: NotificationMessage): Promise<void> => {
  const producer = await getKafkaProducer();
  // keyed by user, matching every other producer, so one user's notifications stay ordered
  await producer.send({
    topic: TOPIC_NOTIFICATIONS,
    messages: [{ key: message.userId, value: JSON.stringify(message) }],
  });
};

export const activationMessage = (
  user: { id: string; email: string; name?: string | null },
  activationCode: string,
  activationUrl: string,
  activationToken: string
): NotificationMessage => ({
  // one id per issued code: a resend is a new email, a redelivery of this one is not
  notificationId: `${user.id}:activation:${createHash('sha256').update(activationToken).digest('hex').slice(0, 16)}`,
  tenantId: TENANT_ID,
  userId: user.id,
  channels: ['EMAIL'],
  templateName: 'account-activation',
  target: { email: user.email, phone: null, deviceTokens: null },
  variables: { name: user.name || 'there', activationCode, activationUrl },
  attempt: 0,
});

/** @returns false when the message could not be queued (Kafka down); the account still exists. */
export const publishActivationEmail = async (
  user: { id: string; email: string; name?: string | null },
  activationCode: string,
  activationUrl: string,
  activationToken: string
): Promise<boolean> => {
  try {
    await publishNotification(activationMessage(user, activationCode, activationUrl, activationToken));
    return true;
  } catch (error) {
    console.error('[notifications] Could not queue the activation email:', error);
    return false;
  }
};
