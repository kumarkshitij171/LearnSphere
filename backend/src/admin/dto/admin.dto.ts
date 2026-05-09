import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';

export class ChangeRoleDto {
    @IsEnum(UserRole) role: UserRole;
}

export class RejectCourseDto {
    @IsString() feedback: string;
}

export class RejectInstructorDto {
    @IsString() reason: string;
}

export class CreateCouponDto {
    @IsString() code: string;
    @IsEnum(['PERCENT', 'FIXED'] as const) discountType: 'PERCENT' | 'FIXED';
    discount: number;
    @IsOptional() maxUses?: number;
    @IsOptional() expiresAt?: string;
    @IsOptional() @IsString() courseId?: string;
}
