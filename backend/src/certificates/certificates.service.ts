import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CertificatesService {
    constructor(private prisma: PrismaService) {}

    async getMyCertificates(userId: string) {
        return this.prisma.certificate.findMany({
            where: { userId },
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async verify(verificationUuid: string) {
        const cert = await this.prisma.certificate.findUnique({
            where: { verificationUuid },
            include: { user: { select: { name: true } } },
        });
        if (!cert) throw new NotFoundException('Certificate not found');
        return cert;
    }

    async issueCertificate(userId: string, courseId: string, pdfUrl: string) {
        return this.prisma.certificate.upsert({
            where: { userId_courseId: { userId, courseId } },
            update: { pdfUrl },
            create: { userId, courseId, pdfUrl },
        });
    }
}
