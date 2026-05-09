'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, 'Must contain uppercase, lowercase, number, and special character'),
});

type FormData = z.infer<typeof schema>;

export default function SignupPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (data: FormData) => {
        setLoading(true);
        try {
            const res = await authApi.register(data);
            toast.success('Account created! Please check your email for the OTP.');
            const token = res.data.token;
            router.push(`/verify?token=${token}`);
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md space-y-6 bg-white p-8 rounded-2xl shadow-sm border">
                <div className="text-center">
                    <h1 className="text-2xl font-bold">Create your account</h1>
                    <p className="text-sm text-gray-500 mt-1">Start learning today</p>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div>
                        <Label htmlFor="name">Full Name</Label>
                        <Input id="name" {...register('name')} placeholder="John Doe" className="mt-1" />
                        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
                    </div>
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
                        {loading ? 'Creating account...' : 'Sign Up'}
                    </Button>
                </form>

                <p className="text-center text-sm text-gray-500">
                    Already have an account?{' '}
                    <Link href="/login" className="text-indigo-600 hover:underline font-medium">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
