import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
    constructor(private prisma: PrismaService) {}

    async findAll() {
        return this.prisma.category.findMany({
            where: { parentId: null },
            include: { children: true },
            orderBy: { name: 'asc' },
        });
    }

    async create(dto: CreateCategoryDto) {
        return this.prisma.category.create({ data: dto });
    }
}
