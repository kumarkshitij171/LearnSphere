import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Categories')
@Controller('api/v1/categories')
export class CategoriesController {
    constructor(private categoriesService: CategoriesService) {}

    @Get()
    findAll() {
        return this.categoriesService.findAll();
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN' as any)
    create(@Body() dto: CreateCategoryDto) {
        return this.categoriesService.create(dto);
    }
}
