import { IsArray, IsNumber, IsString } from 'class-validator';

export class CreateSectionDto {
    @IsString() title: string;
    @IsNumber() order: number;
}

export class UpdateSectionDto {
    @IsString() title: string;
}

export class ReorderSectionsDto {
    @IsArray() items: { id: string; order: number }[];
}
