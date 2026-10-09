const mockSend = jest.fn().mockResolvedValue(undefined);
jest.mock('../../services/kafka.service', () => ({
  getKafkaProducer: jest.fn(async () => ({ send: mockSend })),
}));

import fs from 'fs';
import path from 'path';
import { activationMessage, publishActivationEmail } from '../../services/notification.service';

const user = { id: 'u1', email: 'jane@example.com', name: 'Jane' };

describe('activation email → notification-service', () => {
  it('publishes the NotificationMessage contract to `notifications`, keyed by user', async () => {
    expect(await publishActivationEmail(user, '4821', 'http://localhost:3000/verify?otp=4821&token=t', 'token-1')).toBe(true);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.topic).toBe('notifications');
    expect(arg.messages[0].key).toBe('u1');
    expect(JSON.parse(arg.messages[0].value)).toEqual({
      notificationId: expect.stringMatching(/^u1:activation:[0-9a-f]{16}$/),
      tenantId: 'learnsphere',
      userId: 'u1',
      channels: ['EMAIL'],
      templateName: 'account-activation',
      target: { email: 'jane@example.com', phone: null, deviceTokens: null },
      variables: { name: 'Jane', activationCode: '4821', activationUrl: 'http://localhost:3000/verify?otp=4821&token=t' },
      attempt: 0,
    });
  });

  it('gives each issued code its own id, so a resend is a new email and a redelivery is not', () => {
    const a = activationMessage(user, '1111', 'u', 'token-a');
    expect(activationMessage(user, '1111', 'u', 'token-a').notificationId).toBe(a.notificationId);
    expect(activationMessage(user, '2222', 'u', 'token-b').notificationId).not.toBe(a.notificationId);
  });

  it('reports false instead of throwing when Kafka is down', async () => {
    mockSend.mockRejectedValueOnce(new Error('broker down'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await publishActivationEmail(user, '4821', 'u', 't')).toBe(false);
  });

  it('every variable it sends is one the seeded account-activation template declares', () => {
    const template = JSON.parse(fs.readFileSync(path.join(__dirname,
      '../../../notification-service/src/main/resources/seed-templates/account-activation.email.json'), 'utf8'));
    const used = new Set(Array.from(String(template.subject + template.templateMessage).matchAll(/\{\{\s*([\w.]+)\s*}}/g), (m) => m[1]));
    const sent = Object.keys(activationMessage(user, '1', 'u', 't').variables);
    expect(template.channel).toBe('EMAIL');
    expect(new Set(sent)).toEqual(used);
  });
});
