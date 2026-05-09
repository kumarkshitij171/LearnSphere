import { IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
    @IsString() name: string;
    @IsString() slug: string;
    @IsOptional() @IsString() parentId?: string;
}
