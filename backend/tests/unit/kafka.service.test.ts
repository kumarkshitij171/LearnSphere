const mockSend = jest.fn().mockResolvedValue(undefined);
const mockConnect = jest.fn().mockResolvedValue(undefined);

jest.mock('kafkajs', () => ({
  Kafka: jest.fn(() => ({
    producer: () => ({ connect: mockConnect, send: mockSend, disconnect: jest.fn() }),
  })),
}));

import { publishVideoUploaded } from '../../services/kafka.service';

const event = {
  videoId: 'vid-1',
  userId: 'user-1',
  bucket: 'raw-video',
  key: 'vid-1/original.mp4',
  inputS3Path: 's3://raw-video/vid-1/original.mp4',
  resolutions: ['240p', '480p', '720p', '1080p'],
};

describe('publishVideoUploaded', () => {
  it('sends a video.uploaded message keyed by videoId with the event payload', async () => {
    await publishVideoUploaded(event);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const arg = mockSend.mock.calls[0][0];
    expect(arg.topic).toBe('video.uploaded');

    const msg = arg.messages[0];
    expect(msg.key).toBe('vid-1');
    const payload = JSON.parse(msg.value);
    expect(payload).toMatchObject({
      videoId: 'vid-1',
      userId: 'user-1',
      bucket: 'raw-video',
      key: 'vid-1/original.mp4',
      resolutions: event.resolutions,
    });
    expect(payload.timestamp).toBeDefined();
  });

  it('propagates a send failure', async () => {
    mockSend.mockRejectedValueOnce(new Error('broker down'));
    await expect(publishVideoUploaded(event)).rejects.toThrow('broker down');
  });
});
