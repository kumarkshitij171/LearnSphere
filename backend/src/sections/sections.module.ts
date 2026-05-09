import { Module } from '@nestjs/common';
import { SectionsService } from './sections.service';
import { SectionsController } from './sections.controller';
import { CoursesModule } from '../courses/courses.module';

@Module({
    imports: [CoursesModule],
    providers: [SectionsService],
    controllers: [SectionsController],
})
export class SectionsModule {}
