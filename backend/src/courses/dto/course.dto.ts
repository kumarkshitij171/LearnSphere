import { IsArray, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CourseLevel } from '@prisma/client';

export class CreateCourseDto {
    @IsString() title: string;
    @IsString() description: string;
    @IsNumber() @Min(0) price: number;
    @IsOptional() @IsString() thumbnail?: string;
    @IsOptional() @IsEnum(CourseLevel) level?: CourseLevel;
    @IsOptional() @IsString() language?: string;
    @IsOptional() @IsString() categoryId?: string;
    @IsOptional() @IsArray() requirements?: string[];
    @IsOptional() @IsArray() learnings?: string[];
    @IsOptional() @IsArray() tags?: string[];
}

export class UpdateCourseDto {
    @IsOptional() @IsString() title?: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsNumber() @Min(0) price?: number;
    @IsOptional() @IsString() thumbnail?: string;
    @IsOptional() @IsEnum(CourseLevel) level?: CourseLevel;
    @IsOptional() @IsString() language?: string;
    @IsOptional() @IsString() categoryId?: string;
    @IsOptional() @IsArray() requirements?: string[];
    @IsOptional() @IsArray() learnings?: string[];
    @IsOptional() @IsArray() tags?: string[];
}

export class CourseFilterDto {
    @IsOptional() @IsString() categoryId?: string;
    @IsOptional() @IsEnum(CourseLevel) level?: CourseLevel;
    @IsOptional() @IsNumber() minPrice?: number;
    @IsOptional() @IsNumber() maxPrice?: number;
    @IsOptional() @IsString() language?: string;
    @IsOptional() @IsNumber() minRating?: number;
    @IsOptional() @IsString() search?: string;
    @IsOptional() @IsString() sortBy?: 'newest' | 'popular' | 'rating';
    @IsOptional() @IsString() cursor?: string;
    @IsOptional() @IsNumber() limit?: number;
}
