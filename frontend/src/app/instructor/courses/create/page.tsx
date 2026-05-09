'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { coursesApi, categoriesApi } from '@/lib/api';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2 } from 'lucide-react';

const schema = z.object({
    title: z.string().min(5, 'Title must be at least 5 characters'),
    description: z.string().min(20, 'Description must be at least 20 characters'),
    categoryId: z.string().min(1, 'Category is required'),
    price: z.coerce.number().min(0, 'Price must be 0 or more'),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS']),
    language: z.string().default('English'),
    thumbnail: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    learnings: z.array(z.object({ value: z.string().min(1) })).min(1, 'Add at least one learning objective'),
    requirements: z.array(z.object({ value: z.string().min(1) })).optional(),
});

type FormData = z.infer<typeof schema>;

export default function CreateCoursePage() {
    const router = useRouter();
    const user = useAppSelector(s => s.auth.user);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            level: 'BEGINNER',
            language: 'English',
            learnings: [{ value: '' }],
            requirements: [{ value: '' }],
        },
    });

    const { fields: learningFields, append: appendLearning, remove: removeLearning } = useFieldArray({ control, name: 'learnings' });
    const { fields: reqFields, append: appendReq, remove: removeReq } = useFieldArray({ control, name: 'requirements' });

    useEffect(() => {
        if (!user || (user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN')) {
            router.push('/dashboard');
            return;
        }
        categoriesApi.list().then(r => setCategories(r.data)).catch(() => {});
    }, [user, router]);

    const onSubmit = async (data: FormData) => {
        setLoading(true);
        try {
            const payload = {
                ...data,
                thumbnail: data.thumbnail || undefined,
                learnings: data.learnings.map(l => l.value).filter(Boolean),
                requirements: (data.requirements ?? []).map(r => r.value).filter(Boolean),
            };
            const res = await coursesApi.create(payload);
            toast.success('Course created!');
            router.push(`/instructor/courses/${res.data.id}/curriculum`);
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to create course');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto max-w-3xl px-4 py-8">
            <h1 className="text-2xl font-bold mb-8">Create New Course</h1>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="bg-white border rounded-xl p-6 space-y-4">
                    <h2 className="font-semibold text-lg">Basic Information</h2>
                    <div className="space-y-1">
                        <Label>Title</Label>
                        <Input {...register('title')} placeholder="e.g. Complete Web Development Bootcamp" />
                        {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
                    </div>
                    <div className="space-y-1">
                        <Label>Description</Label>
                        <Textarea {...register('description')} rows={4} placeholder="What will students learn in this course?" />
                        {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>Category</Label>
                            <select {...register('categoryId')} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="">Select a category</option>
                                {categories.map((c: any) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            {errors.categoryId && <p className="text-xs text-red-500">{errors.categoryId.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <Label>Level</Label>
                            <select {...register('level')} className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="BEGINNER">Beginner</option>
                                <option value="INTERMEDIATE">Intermediate</option>
                                <option value="ADVANCED">Advanced</option>
                                <option value="ALL_LEVELS">All Levels</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <Label>Price (USD)</Label>
                            <Input type="number" step="0.01" min="0" {...register('price')} placeholder="0 for free" />
                            {errors.price && <p className="text-xs text-red-500">{errors.price.message}</p>}
                        </div>
                        <div className="space-y-1">
                            <Label>Language</Label>
                            <Input {...register('language')} placeholder="English" />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label>Thumbnail URL</Label>
                        <Input {...register('thumbnail')} placeholder="https://..." />
                        {errors.thumbnail && <p className="text-xs text-red-500">{errors.thumbnail.message}</p>}
                    </div>
                </div>

                {/* Learning objectives */}
                <div className="bg-white border rounded-xl p-6 space-y-3">
                    <h2 className="font-semibold text-lg">What students will learn</h2>
                    {learningFields.map((field, index) => (
                        <div key={field.id} className="flex gap-2">
                            <Input {...register(`learnings.${index}.value`)} placeholder={`Learning objective ${index + 1}`} />
                            {learningFields.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeLearning(index)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            )}
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => appendLearning({ value: '' })}>
                        <Plus className="h-4 w-4 mr-1" /> Add objective
                    </Button>
                    {errors.learnings && <p className="text-xs text-red-500">Add at least one learning objective</p>}
                </div>

                {/* Requirements */}
                <div className="bg-white border rounded-xl p-6 space-y-3">
                    <h2 className="font-semibold text-lg">Requirements</h2>
                    {reqFields.map((field, index) => (
                        <div key={field.id} className="flex gap-2">
                            <Input {...register(`requirements.${index}.value`)} placeholder={`Requirement ${index + 1}`} />
                            {reqFields.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeReq(index)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            )}
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => appendReq({ value: '' })}>
                        <Plus className="h-4 w-4 mr-1" /> Add requirement
                    </Button>
                </div>

                <div className="flex gap-3 justify-end">
                    <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                    <Button type="submit" disabled={loading}>
                        {loading ? 'Creating...' : 'Create Course'}
                    </Button>
                </div>
            </form>
        </div>
    );
}
