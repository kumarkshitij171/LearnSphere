import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionOptionDto {
    @IsString() id: string;
    @IsString() text: string;
    @IsOptional() isCorrect?: boolean;
}

export class CreateQuestionDto {
    @IsString() type: 'MCQ' | 'TRUE_FALSE';
    @IsString() text: string;
    @IsArray() @ValidateNested({ each: true }) @Type(() => QuestionOptionDto) options: QuestionOptionDto[];
    @IsOptional() @IsString() explanation?: string;
    @IsInt() order: number;
}

export class CreateQuizDto {
    @IsInt() @Min(1) @Max(100) passMark: number;
    @IsArray() @ValidateNested({ each: true }) @Type(() => CreateQuestionDto) questions: CreateQuestionDto[];
}

export class SubmitQuizDto {
    @IsArray() answers: { questionId: string; selectedOptionId: string }[];
}
