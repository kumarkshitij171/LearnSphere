const consumers: Array<Record<string, jest.Mock>> = [];
const makeConsumer = (subscribe: jest.Mock) => {
  const c = {
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe,
    run: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  };
  consumers.push(c);
  return c;
};
const subscribeResults: Array<() => Promise<void>> = [];

jest.mock('../../services/kafka.service', () => ({
  kafka: {
    consumer: jest.fn(() => makeConsumer(jest.fn(() => (subscribeResults.shift() ?? (() => Promise.resolve()))()))),
  },
}));
jest.mock('../../services/course.service', () => ({ grantFromOrder: jest.fn(), revokeFromOrder: jest.fn() }));

import { startOrderEventsConsumer, stopOrderEventsConsumer } from '../../services/kafkaConsumer.service';

describe('startOrderEventsConsumer', () => {
  beforeEach(() => {
    consumers.length = 0;
    subscribeResults.length = 0;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await stopOrderEventsConsumer();
    jest.restoreAllMocks();
  });

  it('keeps retrying until the broker accepts the subscription', async () => {
    const notHosted = () => Promise.reject(new Error('This server does not host this topic-partition'));
    subscribeResults.push(notHosted, notHosted);

    await startOrderEventsConsumer({ initialDelayMs: 1, maxDelayMs: 2 });

    expect(consumers).toHaveLength(3);
    expect(consumers[0].disconnect).toHaveBeenCalled();
    expect(consumers[1].disconnect).toHaveBeenCalled();
    expect(consumers[2].run).toHaveBeenCalledTimes(1);
  });

  it('does not start a second consumer once one is running', async () => {
    await startOrderEventsConsumer({ initialDelayMs: 1 });
    await startOrderEventsConsumer({ initialDelayMs: 1 });
    expect(consumers).toHaveLength(1);
  });

  it('stops retrying when the service shuts down', async () => {
    subscribeResults.push(...Array.from({ length: 100 }, () => () => Promise.reject(new Error('down'))));
    const starting = startOrderEventsConsumer({ initialDelayMs: 5, maxDelayMs: 5 });
    await new Promise((r) => setTimeout(r, 12));
    await stopOrderEventsConsumer();
    await starting;
    const attempts = consumers.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(consumers.length).toBe(attempts);
  });
});
