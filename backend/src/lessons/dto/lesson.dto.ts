import { IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { LessonType } from '@prisma/client';

export class CreateLessonDto {
    @IsString() title: string;
    @IsNumber() order: number;
    @IsEnum(LessonType) type: LessonType;
    @IsOptional() @IsBoolean() isFree?: boolean;
    @IsOptional() @IsString() videoId?: string;
    @IsOptional() @IsString() textContent?: string;
    @IsOptional() @IsNumber() duration?: number;
}

export class UpdateLessonDto {
    @IsOptional() @IsString() title?: string;
    @IsOptional() @IsNumber() order?: number;
    @IsOptional() @IsBoolean() isFree?: boolean;
    @IsOptional() @IsString() videoId?: string;
    @IsOptional() @IsString() textContent?: string;
    @IsOptional() @IsNumber() duration?: number;
}

export class ReorderLessonsDto {
    @IsArray() items: { id: string; order: number }[];
}
