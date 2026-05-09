'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { authApi } from '@/lib/api';
import { useAppDispatch } from '@/store/hooks';
import { fetchMe } from '@/store/slices/authSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function VerifyForm() {
    const router = useRouter();
    const params = useSearchParams();
    const token = params.get('token') ?? '';
    const dispatch = useAppDispatch();
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!otp || !token) { toast.error('OTP and token required'); return; }
        setLoading(true);
        try {
            await authApi.verify(token, otp);
            await dispatch(fetchMe());
            toast.success('Account verified!');
            router.push('/dashboard');
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-sm space-y-6 bg-white p-8 rounded-2xl shadow-sm border">
                <div className="text-center">
                    <h1 className="text-2xl font-bold">Verify your email</h1>
                    <p className="text-sm text-gray-500 mt-1">Enter the 4-digit OTP sent to your email</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="otp">OTP Code</Label>
                        <Input
                            id="otp"
                            value={otp}
                            onChange={e => setOtp(e.target.value)}
                            maxLength={4}
                            placeholder="1234"
                            className="mt-1 text-center text-2xl tracking-widest"
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Verifying...' : 'Verify Account'}
                    </Button>
                </form>
            </div>
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense>
            <VerifyForm />
        </Suspense>
    );
}
