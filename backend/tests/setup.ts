// Env defaults for tests, set before any module under test is imported.
process.env.NODE_ENV = 'test';

process.env.JWT_SECRET = 'test_jwt_secret';
process.env.ACCESS_TOKEN_SECRET = 'test_access_secret';
process.env.REFRESH_TOKEN_SECRET = 'test_refresh_secret';
process.env.ACCESS_TOKEN_EXPIRY = '5m';
process.env.REFRESH_TOKEN_EXPIRY = '7d';
process.env.BCRYPT_PEPPER = 'test_pepper';
process.env.CLIENT_URL = 'http://localhost:3000';

process.env.AWS_REGION = 'us-east-1';
process.env.S3_RAW_VIDEO_BUCKET = 'raw-video';
process.env.S3_PROCESSED_VIDEO_BUCKET = 'processed-video';
process.env.PRESIGNED_URL_EXPIRY = '3600';
process.env.SQS_QUEUE_URL = 'http://localhost:4566/000000000000/test-queue';
process.env.KAFKA_BROKERS = 'localhost:9092';
process.env.KAFKA_TOPIC_VIDEO_UPLOADED = 'video.uploaded';

process.env.TRANCODER_API_KEY = 'test_transcoder_key';
process.env.INTERNAL_API_KEY = 'test_internal_key';
