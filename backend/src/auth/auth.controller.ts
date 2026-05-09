import {
    Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyDto } from './dto/verify.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

const ACCESS_COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 5 * 60 * 1000,
};

const REFRESH_COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 59 * 60 * 1000,
};

@ApiTags('Auth')
@Controller('api/v1/auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    @Post('register')
    @ApiOperation({ summary: 'Register new user' })
    async register(@Body() dto: RegisterDto, @Res() res: Response) {
        const { token } = await this.authService.register(dto);
        res.cookie('token', token, { httpOnly: true, maxAge: 5 * 60 * 1000 });
        return res.json({ success: true, message: 'Account created. Please verify your email.' });
    }

    @Post('verify')
    @HttpCode(200)
    @ApiOperation({ summary: 'Verify OTP and activate account' })
    async verify(@Body() dto: VerifyDto, @Res() res: Response) {
        const { accessToken, refreshToken } = await this.authService.verify(dto.token, dto.otp);
        res.cookie('access_token', accessToken, ACCESS_COOKIE_OPTS)
            .cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTS);
        return res.json({ success: true, message: 'Account verified successfully' });
    }

    @Post('login')
    @HttpCode(200)
    @ApiOperation({ summary: 'Login with email and password' })
    async login(@Body() dto: LoginDto, @Res() res: Response) {
        const { accessToken, refreshToken } = await this.authService.login(dto);
        res.cookie('access_token', accessToken, ACCESS_COOKIE_OPTS)
            .cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTS);
        return res.json({ success: true, message: 'Login successful' });
    }

    @Post('refresh-token')
    @HttpCode(200)
    async refreshToken(@Req() req: Request, @Res() res: Response) {
        const token = req.cookies.refresh_token || req.body.refresh_token;
        if (!token) throw new UnauthorizedException('No refresh token provided');
        const { accessToken } = await this.authService.refreshToken(token);
        res.cookie('access_token', accessToken, ACCESS_COOKIE_OPTS);
        return res.json({ success: true, accessToken });
    }

    @Get('logout')
    @UseGuards(JwtAuthGuard)
    async logout(@CurrentUser() user: any, @Res() res: Response) {
        await this.authService.logout(user.id);
        res.clearCookie('access_token').clearCookie('refresh_token');
        return res.json({ success: true, message: 'Logged out successfully' });
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    getMe(@CurrentUser() user: any) {
        return { success: true, user };
    }
}
