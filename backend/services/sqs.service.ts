import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  ReceiveMessageCommandInput,
} from '@aws-sdk/client-sqs';
import { awsClientConfig } from '../config/awsConfig';

type RawSqsMessage = { body: any; receiptHandle: string };

type StartSQSConsumerOptions = {
  handleMessage: (message: RawSqsMessage) => Promise<void>;
  maxNumberOfMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
  pollIntervalMs?: number;
  abortSignal?: AbortSignal;
};

const createSQSClient = () => new SQSClient(awsClientConfig());

const sqsClient = createSQSClient();

export const parseMessageBody = (body?: string) => {
  if (!body) return {};

  try {
    const parsed = JSON.parse(body);
    // LocalStack can wrap messages in an SNS-style envelope
    if (parsed.Message) {
      return JSON.parse(parsed.Message);
    }
    return parsed;
  } catch {
    return {};
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startSQSConsumer = async ({
  handleMessage,
  maxNumberOfMessages = 5,
  waitTimeSeconds = 10,
  visibilityTimeout = 60,
  pollIntervalMs = 1000,
  abortSignal,
}: StartSQSConsumerOptions) => {
  const queueUrl = process.env.SQS_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('SQS_QUEUE_URL is not configured');
  }

  const receiveConfig: ReceiveMessageCommandInput = {
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxNumberOfMessages,
    WaitTimeSeconds: waitTimeSeconds,
    VisibilityTimeout: visibilityTimeout,
  };

  while (!abortSignal?.aborted) {
    try {
      const response = await sqsClient.send(new ReceiveMessageCommand(receiveConfig));

      if (!response.Messages || response.Messages.length === 0) {
        await sleep(pollIntervalMs);
        continue;
      }

      for (const message of response.Messages) {
        if (!message.ReceiptHandle) continue;

        const parsedBody = parseMessageBody(message.Body);
        try {
          await handleMessage({ body: parsedBody, receiptHandle: message.ReceiptHandle });
          await sqsClient.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            })
          );
        } catch (error) {
          // Leave the message in-flight; it will become visible again after the visibility timeout.
          console.error('Error handling SQS message:', error);
        }
      }
    } catch (error) {
      console.error('Error receiving SQS messages:', error);
      await sleep(pollIntervalMs);
    }
  }
};

