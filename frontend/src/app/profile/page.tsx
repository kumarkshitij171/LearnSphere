'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usersApi } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchMe } from '@/store/slices/authSlice';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { User, Lock, GraduationCap, Plus, Trash2 } from 'lucide-react';

const profileSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    bio: z.string().optional(),
    avatar: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

const passwordSchema = z.object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'At least 8 characters'),
    confirm: z.string(),
}).refine(d => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

const instructorSchema = z.object({
    headline: z.string().min(5, 'Add a short headline'),
    bio: z.string().min(20, 'Tell us about yourself (at least 20 chars)'),
    expertise: z.array(z.object({ value: z.string().min(1) })).min(1, 'Add at least one area'),
    yearsExperience: z.coerce.number().min(0),
    teachingMotivation: z.string().min(10, 'Required'),
    linkedinUrl: z.string().url().optional().or(z.literal('')),
    websiteUrl: z.string().url().optional().or(z.literal('')),
});

type ProfileData = z.infer<typeof profileSchema>;
type PasswordData = z.infer<typeof passwordSchema>;
type InstructorData = z.infer<typeof instructorSchema>;

type Tab = 'profile' | 'security' | 'instructor';

export default function ProfilePage() {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const user = useAppSelector(s => s.auth.user);
    const [activeTab, setActiveTab] = useState<Tab>('profile');

    useEffect(() => {
        if (!user) { router.push('/login'); }
    }, [user, router]);

    if (!user) return null;

    return (
        <div className="container mx-auto px-4 py-8 max-w-3xl">
            <h1 className="text-2xl font-bold mb-8">Account Settings</h1>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-8">
                {([
                    { id: 'profile', icon: User, label: 'Profile' },
                    { id: 'security', icon: Lock, label: 'Security' },
                    ...(user.role === 'STUDENT' ? [{ id: 'instructor', icon: GraduationCap, label: 'Become Instructor' }] : []),
                ] as { id: Tab; icon: any; label: string }[]).map(({ id, icon: Icon, label }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === id ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                ))}
            </div>

            {activeTab === 'profile' && <ProfileForm user={user} onSaved={() => dispatch(fetchMe())} />}
            {activeTab === 'security' && <PasswordForm />}
            {activeTab === 'instructor' && user.role === 'STUDENT' && <InstructorApplicationForm onSubmitted={() => dispatch(fetchMe())} />}
        </div>
    );
}

function ProfileForm({ user, onSaved }: { user: any; onSaved: () => void }) {
    const { register, handleSubmit, formState: { errors } } = useForm<ProfileData>({
        resolver: zodResolver(profileSchema),
        defaultValues: { name: user.name ?? '', bio: user.bio ?? '', avatar: user.avatar ?? '' },
    });
    const [loading, setLoading] = useState(false);

    const onSubmit = async (data: ProfileData) => {
        setLoading(true);
        try {
            await usersApi.updateProfile({ ...data, avatar: data.avatar || undefined });
            toast.success('Profile updated');
            onSaved();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Update failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b">
                <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600 shrink-0">
                    {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="h-full w-full rounded-full object-cover" />
                    ) : user.name?.[0]}
                </div>
                <div>
                    <p className="font-semibold">{user.name}</p>
                    <p className="text-sm text-gray-400">{user.email}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${user.role === 'ADMIN' ? 'bg-red-50 text-red-600' : user.role === 'INSTRUCTOR' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                        {user.role}
                    </span>
                </div>
            </div>
            <div className="space-y-1">
                <Label>Display Name</Label>
                <Input {...register('name')} />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
                <Label>Bio</Label>
                <Textarea {...register('bio')} rows={3} placeholder="Tell students about yourself..." />
            </div>
            <div className="space-y-1">
                <Label>Avatar URL</Label>
                <Input {...register('avatar')} placeholder="https://..." />
                {errors.avatar && <p className="text-xs text-red-500">{errors.avatar.message}</p>}
            </div>
            <div className="flex justify-end">
                <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Profile'}</Button>
            </div>
        </form>
    );
}

function PasswordForm() {
    const { register, handleSubmit, reset, formState: { errors } } = useForm<PasswordData>({
        resolver: zodResolver(passwordSchema),
    });
    const [loading, setLoading] = useState(false);

    const onSubmit = async (data: PasswordData) => {
        setLoading(true);
        try {
            await usersApi.changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword });
            toast.success('Password changed successfully');
            reset();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to change password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white border rounded-xl p-6 space-y-4">
            <h2 className="font-semibold">Change Password</h2>
            <div className="space-y-1">
                <Label>Current Password</Label>
                <Input type="password" {...register('currentPassword')} />
                {errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword.message}</p>}
            </div>
            <div className="space-y-1">
                <Label>New Password</Label>
                <Input type="password" {...register('newPassword')} />
                {errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword.message}</p>}
            </div>
            <div className="space-y-1">
                <Label>Confirm New Password</Label>
                <Input type="password" {...register('confirm')} />
                {errors.confirm && <p className="text-xs text-red-500">{errors.confirm.message}</p>}
            </div>
            <div className="flex justify-end">
                <Button type="submit" disabled={loading}>{loading ? 'Changing...' : 'Change Password'}</Button>
            </div>
        </form>
    );
}

function InstructorApplicationForm({ onSubmitted }: { onSubmitted: () => void }) {
    const { register, control, handleSubmit, formState: { errors } } = useForm<InstructorData>({
        resolver: zodResolver(instructorSchema),
        defaultValues: { expertise: [{ value: '' }] },
    });
    const { fields, append, remove } = useFieldArray({ control, name: 'expertise' });
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const onSubmit = async (data: InstructorData) => {
        setLoading(true);
        try {
            await usersApi.applyInstructor({
                ...data,
                expertise: data.expertise.map(e => e.value).filter(Boolean),
                linkedinUrl: data.linkedinUrl || undefined,
                websiteUrl: data.websiteUrl || undefined,
            });
            toast.success('Application submitted! We will review it shortly.');
            setSubmitted(true);
            onSubmitted();
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Application failed');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="bg-white border rounded-xl p-10 text-center">
                <GraduationCap className="h-16 w-16 text-indigo-400 mx-auto mb-4" />
                <h2 className="text-lg font-semibold mb-2">Application Submitted!</h2>
                <p className="text-gray-500 text-sm">Our team will review your application and get back to you via email.</p>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-700">
                Share your expertise with thousands of students. Fill out this application to become an instructor on LMS.
            </div>
            <div className="bg-white border rounded-xl p-6 space-y-4">
                <h2 className="font-semibold">Your Profile</h2>
                <div className="space-y-1">
                    <Label>Headline</Label>
                    <Input {...register('headline')} placeholder="e.g. Senior Full-Stack Developer with 10 years experience" />
                    {errors.headline && <p className="text-xs text-red-500">{errors.headline.message}</p>}
                </div>
                <div className="space-y-1">
                    <Label>Bio</Label>
                    <Textarea {...register('bio')} rows={4} placeholder="Tell students about your background, experience, and teaching style..." />
                    {errors.bio && <p className="text-xs text-red-500">{errors.bio.message}</p>}
                </div>
                <div className="space-y-1">
                    <Label>Years of Experience</Label>
                    <Input type="number" min="0" max="60" {...register('yearsExperience')} className="w-32" />
                </div>
                <div className="space-y-2">
                    <Label>Areas of Expertise</Label>
                    {fields.map((field, index) => (
                        <div key={field.id} className="flex gap-2">
                            <Input {...register(`expertise.${index}.value`)} placeholder={`e.g. React, Node.js, Python`} />
                            {fields.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                                    <Trash2 className="h-4 w-4 text-red-400" />
                                </Button>
                            )}
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ value: '' })}>
                        <Plus className="h-4 w-4 mr-1" /> Add area
                    </Button>
                    {errors.expertise && <p className="text-xs text-red-500">Add at least one area of expertise</p>}
                </div>
                <div className="space-y-1">
                    <Label>Why do you want to teach?</Label>
                    <Textarea {...register('teachingMotivation')} rows={3} placeholder="Share your motivation for teaching..." />
                    {errors.teachingMotivation && <p className="text-xs text-red-500">{errors.teachingMotivation.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label>LinkedIn URL (optional)</Label>
                        <Input {...register('linkedinUrl')} placeholder="https://linkedin.com/in/..." />
                        {errors.linkedinUrl && <p className="text-xs text-red-500">{errors.linkedinUrl.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>Website URL (optional)</Label>
                        <Input {...register('websiteUrl')} placeholder="https://..." />
                        {errors.websiteUrl && <p className="text-xs text-red-500">{errors.websiteUrl.message}</p>}
                    </div>
                </div>
            </div>
            <div className="flex justify-end">
                <Button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit Application'}</Button>
            </div>
        </form>
    );
}
