import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { startSQSConsumer, parseMessageBody } from '../../services/sqs.service';

const sqsMock = mockClient(SQSClient);

beforeEach(() => sqsMock.reset());

describe('parseMessageBody', () => {
  it('parses a plain JSON body', () => {
    expect(parseMessageBody(JSON.stringify({ foo: 'bar' }))).toEqual({ foo: 'bar' });
  });

  it('unwraps an SNS-style envelope', () => {
    const inner = { videoId: 'vid-1' };
    const envelope = JSON.stringify({ Message: JSON.stringify(inner) });
    expect(parseMessageBody(envelope)).toEqual(inner);
  });

  it('returns {} for empty or invalid bodies', () => {
    expect(parseMessageBody(undefined)).toEqual({});
    expect(parseMessageBody('not-json')).toEqual({});
  });
});

describe('startSQSConsumer', () => {
  it('handles a message, deletes it, then stops on abort', async () => {
    sqsMock.on(ReceiveMessageCommand).resolves({
      Messages: [{ Body: JSON.stringify({ foo: 'bar' }), ReceiptHandle: 'rh-1' }],
    });
    sqsMock.on(DeleteMessageCommand).resolves({});

    const controller = new AbortController();
    const handleMessage = jest.fn().mockImplementation(async () => controller.abort());

    await startSQSConsumer({
      handleMessage,
      abortSignal: controller.signal,
      pollIntervalMs: 1,
    });

    expect(handleMessage).toHaveBeenCalledWith({ body: { foo: 'bar' }, receiptHandle: 'rh-1' });
    expect(sqsMock.commandCalls(DeleteMessageCommand)).toHaveLength(1);
  });

  it('throws when SQS_QUEUE_URL is missing', async () => {
    const saved = process.env.SQS_QUEUE_URL;
    delete process.env.SQS_QUEUE_URL;
    await expect(
      startSQSConsumer({ handleMessage: jest.fn(), abortSignal: new AbortController().signal })
    ).rejects.toThrow('SQS_QUEUE_URL');
    process.env.SQS_QUEUE_URL = saved;
  });
});
