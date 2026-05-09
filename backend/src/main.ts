import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser = require('cookie-parser');
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule, { rawBody: true });

    // Cookie parser
    app.use(cookieParser());

    // CORS
    app.enableCors({
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Mobile-App', 'X-Transcoder-Api-Key'],
    });

    // Global validation
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
    }));

    // Swagger docs
    const config = new DocumentBuilder()
        .setTitle('LMS API')
        .setDescription('Learning Management System API')
        .setVersion('1.0')
        .addBearerAuth()
        .addCookieAuth('access_token')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT || 5001;
    await app.listen(port);
    console.log(`LMS backend running on port ${port}`);
    console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
