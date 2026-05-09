import { Body, Controller, Delete, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SectionsService } from './sections.service';
import { CreateSectionDto, UpdateSectionDto, ReorderSectionsDto } from './dto/section.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Sections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('INSTRUCTOR' as any)
@Controller('api/v1/courses/:courseId/sections')
export class SectionsController {
    constructor(private sectionsService: SectionsService) {}

    @Post()
    create(@Param('courseId') courseId: string, @CurrentUser() user: any, @Body() dto: CreateSectionDto) {
        return this.sectionsService.create(courseId, user.id, dto);
    }

    @Patch(':sectionId')
    update(@Param('sectionId') sectionId: string, @CurrentUser() user: any, @Body() dto: UpdateSectionDto) {
        return this.sectionsService.update(sectionId, user.id, dto);
    }

    @Delete(':sectionId')
    remove(@Param('sectionId') sectionId: string, @CurrentUser() user: any) {
        return this.sectionsService.remove(sectionId, user.id);
    }

    @Put('reorder')
    reorder(@Param('courseId') courseId: string, @CurrentUser() user: any, @Body() dto: ReorderSectionsDto) {
        return this.sectionsService.reorder(courseId, user.id, dto);
    }
}
