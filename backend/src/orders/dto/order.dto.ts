import { IsOptional, IsString } from 'class-validator';

export class CheckoutDto {
    @IsString() courseId: string;
    @IsOptional() @IsString() couponCode?: string;
}

export class ValidateCouponDto {
    @IsString() code: string;
    @IsString() courseId: string;
}
