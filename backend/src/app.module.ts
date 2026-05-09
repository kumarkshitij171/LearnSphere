import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { KafkaModule } from './kafka/kafka.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { CoursesModule } from './courses/courses.module';
import { SectionsModule } from './sections/sections.module';
import { LessonsModule } from './lessons/lessons.module';
import { EnrollmentModule } from './enrollment/enrollment.module';
import { OrdersModule } from './orders/orders.module';
import { ReviewsModule } from './reviews/reviews.module';
import { QuizModule } from './quiz/quiz.module';
import { CertificatesModule } from './certificates/certificates.module';
import { QaModule } from './qa/qa.module';
import { AdminModule } from './admin/admin.module';
import { VideoUploadModule } from './video-upload/video-upload.module';
import { InstructorModule } from './instructor/instructor.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

        // Infrastructure
        PrismaModule,
        RedisModule,
        KafkaModule,

        // Feature modules
        AuthModule,
        UsersModule,
        CategoriesModule,
        CoursesModule,
        SectionsModule,
        LessonsModule,
        EnrollmentModule,
        OrdersModule,
        ReviewsModule,
        QuizModule,
        CertificatesModule,
        QaModule,
        AdminModule,
        VideoUploadModule,
        InstructorModule,
        NotificationsModule,
    ],
    providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
})
export class AppModule {}
