import { BadRequestException, Injectable, NotFoundException, RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe = require('stripe');
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { EnrollmentService } from '../enrollment/enrollment.service';
import { CheckoutDto, ValidateCouponDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
    private stripe: any;
    private platformFeePercent: number;

    constructor(
        private prisma: PrismaService,
        private kafka: KafkaService,
        private enrollment: EnrollmentService,
        private config: ConfigService,
    ) {
        this.stripe = new (Stripe as any)(config.get<string>('STRIPE_SECRET_KEY')!, { apiVersion: '2026-04-22.dahlia' });
        this.platformFeePercent = parseFloat(config.get('PLATFORM_FEE_PERCENT', '30'));
    }

    async initiateCheckout(userId: string, dto: CheckoutDto) {
        const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
        if (!course) throw new NotFoundException('Course not found');
        if (course.status !== 'PUBLISHED') throw new BadRequestException('Course is not available');

        const existing = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId: dto.courseId } },
        });
        if (existing) throw new BadRequestException('Already enrolled');

        let amount = course.price;
        let couponRecord: any = null;

        if (dto.couponCode) {
            couponRecord = await this.prisma.coupon.findUnique({ where: { code: dto.couponCode } });
            if (couponRecord) amount = this.applyCoupon(amount, couponRecord);
        }

        const instructorRevenue = parseFloat((amount * (1 - this.platformFeePercent / 100)).toFixed(2));
        const platformRevenue = parseFloat((amount - instructorRevenue).toFixed(2));

        const paymentIntent = await this.stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: 'usd',
            metadata: { userId, courseId: dto.courseId },
        });

        const order = await this.prisma.order.create({
            data: {
                userId, courseId: dto.courseId, amount,
                stripePaymentId: paymentIntent.id,
                couponId: couponRecord?.id,
                platformFeePercent: this.platformFeePercent,
                instructorRevenue, platformRevenue,
            },
        });

        return { clientSecret: paymentIntent.client_secret, orderId: order.id };
    }

    async handleWebhook(req: RawBodyRequest<Request>) {
        const sig = req.headers['stripe-signature'] as string;
        const event = this.stripe.webhooks.constructEvent(
            req.rawBody!,
            sig,
            this.config.get<string>('STRIPE_WEBHOOK_SECRET')!,
        );

        if (event.type === 'payment_intent.succeeded') {
            await this.handlePaymentSuccess(event.data.object as any);
        }

        if (event.type === 'payment_intent.payment_failed') {
            const pi = event.data.object as any;
            await this.prisma.order.updateMany({ where: { stripePaymentId: pi.id }, data: { status: 'FAILED' } });
        }
    }

    private async handlePaymentSuccess(pi: any) {
        const order = await this.prisma.order.findFirst({ where: { stripePaymentId: pi.id } });
        if (!order || order.status === 'COMPLETED') return;

        await this.prisma.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
        await this.enrollment.enrollFreeInternal(order.userId, order.courseId, order.id);

        if (order.couponId) {
            await this.prisma.coupon.update({ where: { id: order.couponId }, data: { usedCount: { increment: 1 } } });
        }

        const course = await this.prisma.course.findUnique({ where: { id: order.courseId } });
        if (course) {
            await this.prisma.instructorProfile.update({
                where: { id: course.instructorId },
                data: { totalRevenue: { increment: order.instructorRevenue } },
            });
        }

        await this.kafka.emit('order.completed', order.userId, {
            orderId: order.id, userId: order.userId, courseId: order.courseId, amount: order.amount,
        });
    }

    async validateCoupon(dto: ValidateCouponDto) {
        const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
        if (!coupon) throw new NotFoundException('Coupon not found');
        if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new BadRequestException('Coupon expired');
        if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new BadRequestException('Coupon exhausted');
        if (coupon.courseId && coupon.courseId !== dto.courseId) throw new BadRequestException('Coupon not valid for this course');

        const course = await this.prisma.course.findUnique({ where: { id: dto.courseId } });
        if (!course) throw new NotFoundException('Course not found');

        const discountedPrice = this.applyCoupon(course.price, coupon);
        return {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discount,
            originalPrice: course.price,
            discountedPrice,
            savings: parseFloat((course.price - discountedPrice).toFixed(2)),
        };
    }

    async getMyOrders(userId: string) {
        return this.prisma.order.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { course: { select: { title: true, thumbnail: true, slug: true } } },
        });
    }

    private applyCoupon(price: number, coupon: { discountType: string; discount: number }) {
        if (coupon.discountType === 'PERCENT') return Math.max(0, price - price * (coupon.discount / 100));
        return Math.max(0, price - coupon.discount);
    }
}
