import { IsNumber, IsString } from 'class-validator';

export class MarkLessonCompleteDto {
    @IsString() lessonId: string;
}

export class SaveWatchPositionDto {
    @IsString() lessonId: string;
    @IsNumber() watchedSeconds: number;
}
