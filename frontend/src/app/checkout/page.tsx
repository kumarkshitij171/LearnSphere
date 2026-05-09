'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { coursesApi, ordersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';
import { ShieldCheck, Tag, CreditCard } from 'lucide-react';

function CheckoutContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const courseId = searchParams.get('courseId') ?? '';
    const user = useAppSelector(s => s.auth.user);

    const [course, setCourse] = useState<any>(null);
    const [couponCode, setCouponCode] = useState('');
    const [couponResult, setCouponResult] = useState<any>(null);
    const [couponLoading, setCouponLoading] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [cardData, setCardData] = useState({
        number: '',
        expiry: '',
        cvc: '',
        name: '',
    });

    useEffect(() => {
        if (!courseId) return;
        coursesApi.getById(courseId)
            .then(r => setCourse(r.data))
            .catch(() => toast.error('Failed to load course'));
    }, [courseId]);

    useEffect(() => {
        if (!user) router.push('/login');
    }, [user, router]);

    const finalPrice = couponResult
        ? couponResult.discountType === 'PERCENT'
            ? (course?.price * (1 - couponResult.discountValue / 100)).toFixed(2)
            : Math.max(0, course?.price - couponResult.discountValue).toFixed(2)
        : course?.price?.toFixed(2);

    const handleValidateCoupon = async () => {
        if (!couponCode.trim()) return;
        setCouponLoading(true);
        try {
            const res = await ordersApi.validateCoupon(couponCode.trim(), courseId);
            setCouponResult(res.data);
            toast.success('Coupon applied!');
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Invalid coupon');
            setCouponResult(null);
        } finally {
            setCouponLoading(false);
        }
    };

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cardData.number || !cardData.expiry || !cardData.cvc || !cardData.name) {
            toast.error('Please fill in all payment details');
            return;
        }
        setCheckoutLoading(true);
        try {
            const res = await ordersApi.checkout(courseId, couponResult ? couponCode : undefined);
            // In a real Stripe integration, res.data.clientSecret would be used with Stripe.js
            // Here we simulate success since no Stripe keys are configured in dev
            toast.success('Payment successful! You are now enrolled.');
            router.push(`/courses/${course?.slug}/learn`);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Payment failed');
        } finally {
            setCheckoutLoading(false);
        }
    };

    if (!course) {
        return (
            <div className="container mx-auto max-w-4xl px-4 py-16">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-1/3" />
                    <div className="h-64 bg-gray-200 rounded" />
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto max-w-4xl px-4 py-10">
            <h1 className="text-2xl font-bold mb-8">Checkout</h1>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                {/* Payment form */}
                <div className="md:col-span-3 space-y-6">
                    <div className="border rounded-xl p-6 space-y-4">
                        <h2 className="font-semibold text-lg flex items-center gap-2">
                            <CreditCard className="h-5 w-5 text-indigo-600" />
                            Payment Details
                        </h2>
                        <form onSubmit={handleCheckout} className="space-y-4">
                            <div className="space-y-1">
                                <Label htmlFor="name">Name on card</Label>
                                <Input
                                    id="name"
                                    placeholder="John Doe"
                                    value={cardData.name}
                                    onChange={e => setCardData(d => ({ ...d, name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="card">Card number</Label>
                                <Input
                                    id="card"
                                    placeholder="1234 5678 9012 3456"
                                    maxLength={19}
                                    value={cardData.number}
                                    onChange={e => {
                                        const v = e.target.value.replace(/\D/g, '').slice(0, 16);
                                        const fmt = v.replace(/(\d{4})/g, '$1 ').trim();
                                        setCardData(d => ({ ...d, number: fmt }));
                                    }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label htmlFor="expiry">Expiry (MM/YY)</Label>
                                    <Input
                                        id="expiry"
                                        placeholder="MM/YY"
                                        maxLength={5}
                                        value={cardData.expiry}
                                        onChange={e => {
                                            const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                                            const fmt = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v;
                                            setCardData(d => ({ ...d, expiry: fmt }));
                                        }}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="cvc">CVC</Label>
                                    <Input
                                        id="cvc"
                                        placeholder="123"
                                        maxLength={4}
                                        value={cardData.cvc}
                                        onChange={e => setCardData(d => ({ ...d, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
                                <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
                                Your payment is encrypted and secure
                            </div>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={checkoutLoading}
                            >
                                {checkoutLoading ? 'Processing...' : `Pay $${finalPrice}`}
                            </Button>
                        </form>
                    </div>

                    {/* Coupon */}
                    <div className="border rounded-xl p-6 space-y-3">
                        <h2 className="font-semibold flex items-center gap-2">
                            <Tag className="h-4 w-4 text-indigo-600" />
                            Coupon Code
                        </h2>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Enter coupon code"
                                value={couponCode}
                                onChange={e => {
                                    setCouponCode(e.target.value.toUpperCase());
                                    if (couponResult) setCouponResult(null);
                                }}
                            />
                            <Button
                                variant="outline"
                                onClick={handleValidateCoupon}
                                disabled={couponLoading || !couponCode.trim()}
                            >
                                Apply
                            </Button>
                        </div>
                        {couponResult && (
                            <p className="text-sm text-green-600">
                                Coupon applied: {couponResult.discountType === 'PERCENT'
                                    ? `${couponResult.discountValue}% off`
                                    : `$${couponResult.discountValue} off`}
                            </p>
                        )}
                    </div>
                </div>

                {/* Order summary */}
                <div className="md:col-span-2">
                    <div className="border rounded-xl p-6 space-y-4 sticky top-24">
                        <h2 className="font-semibold text-lg">Order Summary</h2>
                        <div className="flex gap-3">
                            <div className="w-16 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                                {course.thumbnail ? (
                                    <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-indigo-100 flex items-center justify-center text-indigo-400 font-bold text-lg">
                                        {course.title[0]}
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-sm font-medium line-clamp-2">{course.title}</p>
                                <p className="text-xs text-gray-500 mt-1">{course.instructor?.user?.name ?? 'Instructor'}</p>
                            </div>
                        </div>
                        <div className="border-t pt-4 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Original price</span>
                                <span>${course.price?.toFixed(2)}</span>
                            </div>
                            {couponResult && (
                                <div className="flex justify-between text-green-600">
                                    <span>Coupon discount</span>
                                    <span>
                                        -{couponResult.discountType === 'PERCENT'
                                            ? `${couponResult.discountValue}%`
                                            : `$${couponResult.discountValue}`}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-base border-t pt-2">
                                <span>Total</span>
                                <span className="text-indigo-600">${finalPrice}</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 text-center">
                            30-Day Money-Back Guarantee
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function CheckoutPage() {
    return <Suspense><CheckoutContent /></Suspense>;
}
