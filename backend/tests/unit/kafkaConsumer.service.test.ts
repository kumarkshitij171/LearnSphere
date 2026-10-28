jest.mock('kafkajs', () => ({ Kafka: jest.fn(() => ({})) }));
jest.mock('../../services/course.service', () => ({
  grantFromOrder: jest.fn(),
  revokeFromOrder: jest.fn(),
}));

import { handleOrderEvent } from '../../services/kafkaConsumer.service';
import { grantFromOrder, revokeFromOrder } from '../../services/course.service';

const grant = grantFromOrder as jest.Mock;
const revoke = revokeFromOrder as jest.Mock;

const paid = {
  eventId: 'evt-1',
  eventType: 'order.paid',
  orderId: 'o1',
  userId: 'u1',
  courseId: 'c1',
  amountMinor: 49900,
  currency: 'INR',
};

describe('handleOrderEvent', () => {
  it('grants an enrollment for order.paid', async () => {
    grant.mockResolvedValue({ ok: true });
    await handleOrderEvent('order.paid', JSON.stringify(paid));
    expect(grant).toHaveBeenCalledWith('u1', 'c1', 'o1');
  });

  it('skips a malformed record instead of throwing', async () => {
    await expect(handleOrderEvent('order.paid', '{not json')).resolves.toBeUndefined();
    await expect(handleOrderEvent('order.paid', JSON.stringify({ orderId: 'o1' }))).resolves.toBeUndefined();
    expect(grant).not.toHaveBeenCalled();
  });

  it('rethrows a database failure so kafkajs retries rather than commits', async () => {
    grant.mockRejectedValue(new Error('db down'));
    await expect(handleOrderEvent('order.paid', JSON.stringify(paid))).rejects.toThrow('db down');
  });

  it('revokes on a full refund and ignores a partial one', async () => {
    revoke.mockResolvedValue({ ok: true });
    await handleOrderEvent('order.refunded', JSON.stringify({ ...paid, eventType: 'order.refunded', fullRefund: true }));
    expect(revoke).toHaveBeenCalledWith('u1', 'c1', 'o1');
    revoke.mockClear();
    await handleOrderEvent('order.refunded', JSON.stringify({ ...paid, eventType: 'order.refunded', fullRefund: false }));
    expect(revoke).not.toHaveBeenCalled();
  });
});
