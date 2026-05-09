import { Module } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentController } from './enrollment.controller';
import { CertificatesModule } from '../certificates/certificates.module';

@Module({
    imports: [CertificatesModule],
    providers: [EnrollmentService],
    controllers: [EnrollmentController],
    exports: [EnrollmentService],
})
export class EnrollmentModule {}
