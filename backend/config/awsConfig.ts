// Shared AWS client config. When LOCAL_STACK_DATA_SOURCE=true we point every
// AWS client at LocalStack; otherwise we use the real AWS account.
export const isLocalStack = (): boolean =>
  process.env.LOCAL_STACK_DATA_SOURCE === 'true';

export const awsClientConfig = () => {
  const region = process.env.AWS_REGION || 'us-east-1';

  if (isLocalStack()) {
    return {
      region,
      endpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      },
    };
  }

  return {
    region,
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  };
};
