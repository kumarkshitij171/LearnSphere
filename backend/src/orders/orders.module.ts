import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { EnrollmentModule } from '../enrollment/enrollment.module';

@Module({
    imports: [EnrollmentModule],
    providers: [OrdersService],
    controllers: [OrdersController],
})
export class OrdersModule {}
