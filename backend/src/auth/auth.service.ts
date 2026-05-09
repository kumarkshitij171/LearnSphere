import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as nodemailer from 'nodemailer';
import * as ejs from 'ejs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KafkaService } from '../kafka/kafka.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    private pepper: string;

    constructor(
        private prisma: PrismaService,
        private redis: RedisService,
        private kafka: KafkaService,
        private config: ConfigService,
        private jwtService: JwtService,
    ) {
        this.pepper = this.config.get('BCRYPT_PEPPER', '');
    }

    async register(dto: RegisterDto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing) throw new BadRequestException('User already exists');

        const hashed = await bcrypt.hash(dto.password + this.pepper, 10);
        const user = await this.prisma.user.create({
            data: { name: dto.name, email: dto.email, password: hashed, role: 'STUDENT', isVerified: false },
        });

        const { token, activationCode } = await this.createActivationToken(user.id, user.name);

        await this.sendActivationEmail(user.email, user.name, activationCode, token);

        return { token };
    }

    async verify(token: string, otp: string) {
        let decoded: any;
        try {
            decoded = jwt.verify(token, this.config.get('JWT_SECRET')!);
        } catch {
            throw new BadRequestException('Invalid or expired token');
        }

        const valid = await bcrypt.compare(otp + this.pepper, decoded.activationCode);
        if (!valid) throw new BadRequestException('Invalid OTP');

        const user = await this.prisma.user.update({
            where: { id: decoded.id },
            data: { isVerified: true },
        });

        await this.kafka.emit('user.registered', user.id, {
            userId: user.id, name: user.name, email: user.email,
        });

        return this.generateTokens(user);
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (!user) throw new BadRequestException('Invalid email or password');

        const valid = await bcrypt.compare(dto.password + this.pepper, user.password);
        if (!valid) throw new BadRequestException('Invalid email or password');

        if (!user.isVerified) throw new ForbiddenException('Please verify your email first');
        if (user.isBanned) throw new ForbiddenException('Your account has been suspended');

        return this.generateTokens(user);
    }

    async refreshToken(refreshToken: string) {
        let decoded: any;
        try {
            decoded = jwt.verify(refreshToken, this.config.get('REFRESH_TOKEN_SECRET')!);
        } catch {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        const session = await this.redis.get(decoded.id);
        if (!session) throw new UnauthorizedException('Session expired');

        const user = JSON.parse(session);
        const { accessToken } = await this.generateTokens(user);
        return { accessToken };
    }

    async logout(userId: string) {
        await this.redis.del(userId);
    }

    private async createActivationToken(userId: string, name: string) {
        const activationCode = Math.floor(1000 + Math.random() * 9000).toString();
        const encryptedCode = await bcrypt.hash(activationCode + this.pepper, 10);

        const token = jwt.sign(
            { id: userId, name, activationCode: encryptedCode },
            this.config.get('JWT_SECRET')!,
            { expiresIn: '10m' },
        );

        return { token, activationCode };
    }

    async generateTokens(user: { id: string; email: string; role: string; name: string; avatar: string | null }) {
        const accessExpiry = this.config.get('ACCESS_TOKEN_EXPIRY', '5m');
        const refreshExpiry = this.config.get('REFRESH_TOKEN_EXPIRY', '59m');

        const accessToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            this.config.get('ACCESS_TOKEN_SECRET')!,
            { expiresIn: accessExpiry },
        );

        const refreshToken = jwt.sign(
            { id: user.id },
            this.config.get('REFRESH_TOKEN_SECRET')!,
            { expiresIn: refreshExpiry },
        );

        const ttl = this.parseExpiry(refreshExpiry);
        await this.redis.set(user.id, JSON.stringify(user), ttl);

        return { accessToken, refreshToken };
    }

    private parseExpiry(expiry: string): number {
        const match = expiry.match(/^(\d+)([smhd])$/);
        if (!match) return 3540;
        const val = parseInt(match[1]);
        const unit = match[2];
        return unit === 's' ? val : unit === 'm' ? val * 60 : unit === 'h' ? val * 3600 : val * 86400;
    }

    private async sendActivationEmail(email: string, name: string, activationCode: string, token: string) {
        const activationUrl = `${this.config.get('CLIENT_URL')}/verify?otp=${activationCode}&token=${token}`;

        const transporter = nodemailer.createTransport({
            host: this.config.get('SMTP_HOST'),
            port: parseInt(this.config.get('SMTP_PORT', '465')),
            service: this.config.get('SMTP_SERVICE'),
            auth: {
                user: this.config.get('SMTP_USER_EMAIL'),
                pass: this.config.get('SMTP_PASSWORD'),
            },
        });

        const templatePath = path.join(process.cwd(), 'views', 'activationMail.ejs');
        const html = await ejs.renderFile(templatePath, { activationCode, name, activationUrl });

        await transporter.sendMail({
            from: this.config.get('SMTP_USER_EMAIL'),
            to: email,
            subject: 'Account Activation',
            html,
        });
    }
}
