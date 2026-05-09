import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
    S3Client, PutObjectCommand, GetObjectCommand,
    HeadBucketCommand, CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';

@Injectable()
export class VideoUploadService {
    private s3: S3Client;
    private rawBucket: string;
    private processedBucket: string;
    private presignExpiry: number;
    private ensuredBuckets = new Set<string>();

    constructor(private prisma: PrismaService, private kafka: KafkaService, private config: ConfigService) {
        this.s3 = new S3Client({
            region: config.get('AWS_REGION', 'us-east-1'),
            endpoint: config.get('S3_ENDPOINT'),
            forcePathStyle: config.get('S3_FORCE_PATH_STYLE') === 'true',
            credentials: config.get('AWS_ACCESS_KEY_ID')
                ? { accessKeyId: config.get('AWS_ACCESS_KEY_ID')!, secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY')! }
                : undefined,
        });
        this.rawBucket = config.get('S3_RAW_VIDEO_BUCKET', 'raw-video');
        this.processedBucket = config.get('S3_PROCESSED_VIDEO_BUCKET', 'processed-video');
        this.presignExpiry = parseInt(config.get('PRESIGNED_URL_EXPIRY', '3600'));
    }

    async presignVideoUpload(userId: string, contentType = 'video/mp4') {
        await this.ensureBucket(this.rawBucket);
        const videoId = randomUUID();
        const key = `${videoId}/original.mp4`;

        const url = await getSignedUrl(
            this.s3,
            new PutObjectCommand({ Bucket: this.rawBucket, Key: key, ContentType: contentType }),
            { expiresIn: this.presignExpiry },
        );

        return { uploadUrl: url, videoId, key };
    }

    async confirmVideoUpload(userId: string, body: {
        videoId: string; originalKey?: string; title: string;
        description?: string; duration?: number; mimeType: string;
        fileName?: string; fileSize?: number;
    }) {
        const key = body.originalKey ?? `${body.videoId}/original.mp4`;

        const video = await this.prisma.video.create({
            data: {
                id: body.videoId, userId,
                originalKey: key, title: body.title,
                description: body.description ?? null,
                duration: body.duration ?? null,
                mimeType: body.mimeType,
                fileName: body.fileName ?? null,
                fileSize: body.fileSize ?? null,
                status: 'UPLOADED',
            },
        });

        await this.kafka.emit('video.uploaded', userId, {
            videoId: body.videoId, userId,
            bucket: this.rawBucket, key,
            inputS3Path: `s3://${this.rawBucket}/${key}`,
            resolutions: ['240p', '480p', '720p', '1080p'],
        });

        return video;
    }

    async markProcessed(videoId: string, status: string, hlsMasterPath?: string, error?: string) {
        const video = await this.prisma.video.findUnique({ where: { id: videoId } });
        if (!video) throw new NotFoundException('Video not found');

        const updated = await this.prisma.video.update({
            where: { id: videoId },
            data: {
                status: status as any,
                hlsMasterPath: hlsMasterPath ?? null,
                ...(error ? { metadata: { error } } : {}),
            },
        });

        if (status === 'READY') {
            await this.kafka.emit('video.ready', video.userId, {
                videoId, userId: video.userId, hlsMasterPath,
            });
        }

        return updated;
    }

    async getVideo(videoId: string) {
        const video = await this.prisma.video.findUnique({
            where: { id: videoId },
            include: { user: { select: { id: true, name: true } } },
        });
        if (!video) throw new NotFoundException('Video not found');
        return video;
    }

    async getStreamUrl(videoId: string) {
        const video = await this.prisma.video.findUnique({ where: { id: videoId } });
        if (!video?.hlsMasterPath) throw new NotFoundException('Video not ready');

        const url = await getSignedUrl(
            this.s3,
            new GetObjectCommand({ Bucket: this.processedBucket, Key: video.hlsMasterPath }),
            { expiresIn: 15 * 60 },
        );

        return { streamUrl: url, expiresIn: 900 };
    }

    private async ensureBucket(bucket: string) {
        if (this.ensuredBuckets.has(bucket)) return;
        try {
            await this.s3.send(new HeadBucketCommand({ Bucket: bucket }));
        } catch (err: any) {
            if ([404, 'NoSuchBucket', 'NotFound'].includes(err?.$metadata?.httpStatusCode ?? err?.code)) {
                await this.s3.send(new CreateBucketCommand({ Bucket: bucket }));
            }
        }
        this.ensuredBuckets.add(bucket);
    }
}
