'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { coursesApi, usersApi } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchMe } from '@/store/slices/authSlice';
import { Button } from '@/components/ui/button';
import { Plus, BookOpen, Users, DollarSign, Star, PenSquare, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_BADGE: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
    PUBLISHED: 'bg-green-100 text-green-700',
    ARCHIVED: 'bg-red-100 text-red-600',
};

export default function InstructorDashboard() {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const { user, initialized } = useAppSelector(s => s.auth);
    const [courses, setCourses] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!initialized) dispatch(fetchMe());
    }, [initialized, dispatch]);

    useEffect(() => {
        if (initialized && (!user || (user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN'))) {
            router.push('/dashboard');
            return;
        }
        if (user) {
            Promise.all([
                coursesApi.myCourses().then(r => setCourses(r.data)),
                usersApi.instructorAnalytics().then(r => setAnalytics(r.data)).catch(() => {}),
            ]).finally(() => setLoading(false));
        }
    }, [user, initialized, router]);

    const handleSubmitForReview = async (courseId: string) => {
        try {
            await coursesApi.submitReview(courseId);
            setCourses(prev => prev.map(c => c.id === courseId ? { ...c, status: 'UNDER_REVIEW' } : c));
            toast.success('Course submitted for review');
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Failed to submit');
        }
    };

    if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><p>Loading...</p></div>;

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-bold">Instructor Dashboard</h1>
                <Link href="/instructor/courses/create">
                    <Button><Plus className="h-4 w-4 mr-2" /> New Course</Button>
                </Link>
            </div>

            {/* Analytics */}
            {analytics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { icon: Users, label: 'Total Students', value: analytics.totalStudents ?? 0 },
                        { icon: DollarSign, label: 'Total Revenue', value: `$${(analytics.totalRevenue ?? 0).toFixed(2)}` },
                        { icon: BookOpen, label: 'Published Courses', value: analytics.publishedCourses ?? 0 },
                        { icon: Star, label: 'Avg Rating', value: '—' },
                    ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="bg-white border rounded-xl p-4">
                            <div className="flex items-center gap-2 text-gray-500 mb-1">
                                <Icon className="h-4 w-4" />
                                <span className="text-xs">{label}</span>
                            </div>
                            <p className="text-2xl font-bold">{value}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Courses */}
            <h2 className="font-semibold text-lg mb-4">My Courses</h2>
            {courses.length === 0 ? (
                <div className="text-center py-16 border rounded-xl bg-gray-50">
                    <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">No courses yet. Create your first course!</p>
                    <Link href="/instructor/courses/create">
                        <Button><Plus className="h-4 w-4 mr-2" /> Create Course</Button>
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    {courses.map((course: any) => (
                        <div key={course.id} className="bg-white border rounded-xl p-4 flex items-center gap-4">
                            <div className="w-20 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                                {course.thumbnail
                                    ? <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                                    : <div className="w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{course.title}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[course.status]}`}>
                                        {course.status}
                                    </span>
                                    <span className="text-xs text-gray-400">{course.totalStudents} students</span>
                                    <span className="text-xs text-gray-400">${course.price}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {course.status === 'DRAFT' && (
                                    <Button size="sm" variant="outline" onClick={() => handleSubmitForReview(course.id)}>
                                        <Send className="h-3 w-3 mr-1" /> Submit
                                    </Button>
                                )}
                                <Link href={`/instructor/courses/${course.id}/edit`}>
                                    <Button size="sm" variant="ghost">
                                        <PenSquare className="h-4 w-4" />
                                    </Button>
                                </Link>
                                <Link href={`/instructor/courses/${course.id}/curriculum`}>
                                    <Button size="sm" variant="ghost">
                                        <BookOpen className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
