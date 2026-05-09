import { Module } from '@nestjs/common';
import { VideoUploadService } from './video-upload.service';
import { VideoUploadController } from './video-upload.controller';

@Module({
    providers: [VideoUploadService],
    controllers: [VideoUploadController],
    exports: [VideoUploadService],
})
export class VideoUploadModule {}
