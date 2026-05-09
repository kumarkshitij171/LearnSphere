import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Certificates')
@Controller('api/v1/certificates')
export class CertificatesController {
    constructor(private certificatesService: CertificatesService) {}

    @Get('my')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    getMy(@CurrentUser() user: any) {
        return this.certificatesService.getMyCertificates(user.id);
    }

    @Get('verify/:uuid')
    verify(@Param('uuid') uuid: string) {
        return this.certificatesService.verify(uuid);
    }
}
