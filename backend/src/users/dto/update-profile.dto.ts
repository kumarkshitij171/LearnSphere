import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsString() bio?: string;
    @IsOptional() @IsString() avatar?: string;
}

export class ChangePasswordDto {
    @IsString() currentPassword: string;
    @IsString() @MinLength(8) newPassword: string;
}

export class ApplyInstructorDto {
    @IsString() bio: string;
    @IsString() headline: string;
    @IsOptional() @IsString() website?: string;
    @IsOptional() socialLinks?: Record<string, string>;
}
