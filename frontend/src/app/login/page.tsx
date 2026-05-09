'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { authApi } from '@/lib/api';
import { useAppDispatch } from '@/store/hooks';
import { fetchMe } from '@/store/slices/authSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(1, 'Password required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const [loading, setLoading] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (data: FormData) => {
        setLoading(true);
        try {
            await authApi.login(data.email, data.password);
            await dispatch(fetchMe());
            toast.success('Welcome back!');
            router.push('/dashboard');
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md space-y-6 bg-white p-8 rounded-2xl shadow-sm border">
                <div className="text-center">
                    <h1 className="text-2xl font-bold">Welcome back</h1>
                    <p className="text-sm text-gray-500 mt-1">Sign in to continue learning</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" {...register('email')} placeholder="you@example.com" className="mt-1" />
                        {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
                    </div>
                    <div>
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" type="password" {...register('password')} className="mt-1" />
                        {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </Button>
                </form>

                <p className="text-center text-sm text-gray-500">
                    Don&apos;t have an account?{' '}
                    <Link href="/signup" className="text-indigo-600 hover:underline font-medium">Sign up</Link>
                </p>
            </div>
        </div>
    );
}
