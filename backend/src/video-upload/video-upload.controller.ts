import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { VideoUploadService } from './video-upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('Video Upload')
@Controller('api/v1/video-upload')
export class VideoUploadController {
    constructor(private videoUploadService: VideoUploadService) {}

    @Post('presign')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    presign(@CurrentUser() user: any, @Body('contentType') contentType?: string) {
        return this.videoUploadService.presignVideoUpload(user.id, contentType);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    confirm(@CurrentUser() user: any, @Body() body: any) {
        return this.videoUploadService.confirmVideoUpload(user.id, body);
    }

    @Post(':videoId/processed')
    processedCallback(@Param('videoId') videoId: string, @Req() req: Request, @Body() body: any) {
        const apiKey = req.headers['x-transcoder-api-key'];
        if (apiKey !== process.env.TRANSCODER_API_KEY) {
            throw new Error('Unauthorized');
        }
        return this.videoUploadService.markProcessed(videoId, body.status, body.hlsMasterPath, body.error);
    }

    @Get(':videoId')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    getVideo(@Param('videoId') videoId: string) {
        return this.videoUploadService.getVideo(videoId);
    }

    @Get(':videoId/stream-url')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    getStreamUrl(@Param('videoId') videoId: string) {
        return this.videoUploadService.getStreamUrl(videoId);
    }
}
