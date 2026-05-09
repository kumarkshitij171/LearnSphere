import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { CheckoutDto, ValidateCouponDto } from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Orders')
@Controller('api/v1/orders')
export class OrdersController {
    constructor(private ordersService: OrdersService) {}

    @Post('checkout')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    checkout(@CurrentUser() user: any, @Body() dto: CheckoutDto) {
        return this.ordersService.initiateCheckout(user.id, dto);
    }

    @Post('webhook')
    webhook(@Req() req: Request) {
        return this.ordersService.handleWebhook(req as any);
    }

    @Post('validate-coupon')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    validateCoupon(@Body() dto: ValidateCouponDto) {
        return this.ordersService.validateCoupon(dto);
    }

    @Get('my')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    myOrders(@CurrentUser() user: any) {
        return this.ordersService.getMyOrders(user.id);
    }
}
