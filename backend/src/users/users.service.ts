import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto, ChangePasswordDto, ApplyInstructorDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService, private config: ConfigService) {}

    async getProfile(userId: string) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, name: true, email: true, role: true, avatar: true, bio: true,
                createdAt: true, instructorProfile: true,
            },
        });
    }

    async updateProfile(userId: string, dto: UpdateProfileDto) {
        return this.prisma.user.update({
            where: { id: userId },
            data: dto,
            select: { id: true, name: true, email: true, role: true, avatar: true, bio: true },
        });
    }

    async changePassword(userId: string, dto: ChangePasswordDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const pepper = this.config.get('BCRYPT_PEPPER', '');
        const valid = await bcrypt.compare(dto.currentPassword + pepper, user.password);
        if (!valid) throw new BadRequestException('Current password is incorrect');

        const hashed = await bcrypt.hash(dto.newPassword + pepper, 10);
        await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    }

    async applyInstructor(userId: string, dto: ApplyInstructorDto) {
        const existing = await this.prisma.instructorProfile.findUnique({ where: { userId } });
        if (existing) throw new BadRequestException('Instructor profile already exists');

        const profile = await this.prisma.instructorProfile.create({
            data: { userId, bio: dto.bio, headline: dto.headline, website: dto.website, socialLinks: dto.socialLinks },
        });

        return profile;
    }

    async getInstructorProfile(userId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({
            where: { userId },
            include: {
                user: { select: { name: true, email: true, avatar: true } },
                courses: { where: { status: 'PUBLISHED' }, select: { id: true, title: true, slug: true, thumbnail: true, rating: true, totalStudents: true } },
            },
        });

        if (!profile) throw new NotFoundException('Instructor profile not found');
        return profile;
    }
}
