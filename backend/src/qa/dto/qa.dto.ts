import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateQuestionDto {
    @IsString() title: string;
    @IsString() body: string;
}

export class CreateAnswerDto {
    @IsString() body: string;
    @IsOptional() @IsBoolean() isInstructorAnswer?: boolean;
}
