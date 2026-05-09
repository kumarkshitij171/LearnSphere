import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { QaService } from './qa.service';
import { CreateQuestionDto, CreateAnswerDto } from './dto/qa.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Q&A')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1')
export class QaController {
    constructor(private qaService: QaService) {}

    @Post('lessons/:lessonId/questions')
    createQuestion(
        @Param('lessonId') lessonId: string,
        @CurrentUser() user: any,
        @Body() dto: CreateQuestionDto,
    ) {
        return this.qaService.createQuestion(user.id, lessonId, dto);
    }

    @Get('lessons/:lessonId/questions')
    listQuestions(@Param('lessonId') lessonId: string) {
        return this.qaService.listQuestions(lessonId);
    }

    @Post('questions/:questionId/answers')
    createAnswer(
        @Param('questionId') questionId: string,
        @CurrentUser() user: any,
        @Body() dto: CreateAnswerDto,
    ) {
        return this.qaService.createAnswer(user.id, questionId, dto, user.role);
    }

    @Get('instructor/unanswered-questions')
    unanswered(@CurrentUser() user: any) {
        return this.qaService.getUnansweredForInstructor(user.id);
    }
}
