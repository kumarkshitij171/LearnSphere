import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { QuizService } from './quiz.service';
import { CreateQuizDto, SubmitQuizDto } from './dto/quiz.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Quiz')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1')
export class QuizController {
    constructor(private quizService: QuizService) {}

    // Instructor: create/update quiz for a lesson
    @Put('lessons/:lessonId/quiz')
    @UseGuards(RolesGuard)
    @Roles('INSTRUCTOR' as any)
    createOrUpdate(@Param('lessonId') lessonId: string, @CurrentUser() user: any, @Body() dto: CreateQuizDto) {
        return this.quizService.createOrUpdate(lessonId, user.id, dto);
    }

    @Delete('lessons/:lessonId/quiz')
    @UseGuards(RolesGuard)
    @Roles('INSTRUCTOR' as any)
    deleteQuiz(@Param('lessonId') lessonId: string, @CurrentUser() user: any) {
        return this.quizService.deleteQuiz(lessonId, user.id);
    }

    // Student: view quiz (no answers)
    @Get('lessons/:lessonId/quiz')
    getQuiz(@Param('lessonId') lessonId: string) {
        return this.quizService.getQuiz(lessonId);
    }

    // Student: submit attempt
    @Post('quizzes/:quizId/attempt')
    submitAttempt(
        @Param('quizId') quizId: string,
        @CurrentUser() user: any,
        @Body() dto: SubmitQuizDto,
    ) {
        return this.quizService.submitAttempt(quizId, user.id, dto);
    }

    @Get('quizzes/:quizId/attempts')
    getHistory(@Param('quizId') quizId: string, @CurrentUser() user: any) {
        return this.quizService.getAttemptHistory(quizId, user.id);
    }
}
