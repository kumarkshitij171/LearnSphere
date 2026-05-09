'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CheckSquare, XSquare, Archive } from 'lucide-react';

const STATUS_BADGE: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
    PUBLISHED: 'bg-green-100 text-green-700',
    ARCHIVED: 'bg-red-100 text-red-600',
};

const STATUS_FILTERS = ['ALL', 'UNDER_REVIEW', 'PUBLISHED', 'DRAFT', 'ARCHIVED'];

export default function AdminCoursesPage() {
    const router = useRouter();
    const user = useAppSelector(s => s.auth.user);
    const [courses, setCourses] = useState<any[]>([]);
    const [filter, setFilter] = useState('UNDER_REVIEW');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user !== undefined && user?.role !== 'ADMIN') { router.push('/dashboard'); return; }
        if (user?.role === 'ADMIN') loadCourses();
    }, [user, router]);

    const loadCourses = (status = filter) => {
        setLoading(true);
        adminApi.allCourses(status === 'ALL' ? undefined : status)
            .then(r => setCourses(r.data))
            .catch(() => toast.error('Failed to load courses'))
            .finally(() => setLoading(false));
    };

    const handleFilterChange = (status: string) => {
        setFilter(status);
        loadCourses(status);
    };

    const handlePublish = async (id: string) => {
        try {
            await adminApi.publishCourse(id);
            setCourses(prev => prev.map(c => c.id === id ? { ...c, status: 'PUBLISHED' } : c));
            toast.success('Course published');
        } catch { toast.error('Failed to publish'); }
    };

    const handleReject = async (id: string) => {
        const feedback = prompt('Rejection feedback:');
        if (!feedback) return;
        try {
            await adminApi.rejectCourse(id, feedback);
            setCourses(prev => prev.map(c => c.id === id ? { ...c, status: 'DRAFT' } : c));
            toast.success('Course sent back to draft');
        } catch { toast.error('Failed to reject'); }
    };

    const handleArchive = async (id: string) => {
        if (!confirm('Archive this course? Students will lose access.')) return;
        try {
            await adminApi.archiveCourse(id);
            setCourses(prev => prev.map(c => c.id === id ? { ...c, status: 'ARCHIVED' } : c));
            toast.success('Course archived');
        } catch { toast.error('Failed to archive'); }
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <h1 className="text-2xl font-bold mb-6">Course Management</h1>

            <div className="flex gap-2 mb-6 flex-wrap">
                {STATUS_FILTERS.map(s => (
                    <button
                        key={s}
                        onClick={() => handleFilterChange(s)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filter === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        {s === 'ALL' ? 'All' : s.replace('_', ' ')}
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="text-center text-gray-400 py-12">Loading...</p>
            ) : courses.length === 0 ? (
                <div className="text-center py-16 border rounded-xl bg-gray-50">
                    <p className="text-gray-400">No courses found</p>
                </div>
            ) : (
                <div className="bg-white border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-gray-50">
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Course</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Instructor</th>
                                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-500">Students</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-500">Price</th>
                                <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {courses.map((course: any) => (
                                <tr key={course.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <p className="font-medium max-w-xs truncate">{course.title}</p>
                                        <p className="text-xs text-gray-400">{course.category?.name}</p>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{course.instructor?.user?.name ?? '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[course.status]}`}>
                                            {course.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-600">{course.totalStudents ?? 0}</td>
                                    <td className="px-4 py-3 text-right text-gray-600">
                                        {course.price === 0 ? 'Free' : `$${course.price}`}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            {course.status === 'UNDER_REVIEW' && (
                                                <>
                                                    <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handlePublish(course.id)}>
                                                        <CheckSquare className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleReject(course.id)}>
                                                        <XSquare className="h-4 w-4" />
                                                    </Button>
                                                </>
                                            )}
                                            {course.status === 'PUBLISHED' && (
                                                <Button size="sm" variant="ghost" className="text-gray-500" onClick={() => handleArchive(course.id)}>
                                                    <Archive className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
