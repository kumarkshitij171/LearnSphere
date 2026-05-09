import { Module } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { LessonsController } from './lessons.controller';
import { CoursesModule } from '../courses/courses.module';
import { VideoUploadModule } from '../video-upload/video-upload.module';

@Module({
    imports: [CoursesModule, VideoUploadModule],
    providers: [LessonsService],
    controllers: [LessonsController],
    exports: [LessonsService],
})
export class LessonsModule {}
