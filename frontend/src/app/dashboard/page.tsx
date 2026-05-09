'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { enrollmentApi } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchMe } from '@/store/slices/authSlice';
import { BookOpen, Play, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const { user, initialized } = useAppSelector(s => s.auth);
    const [enrollments, setEnrollments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!initialized) dispatch(fetchMe());
    }, [initialized, dispatch]);

    useEffect(() => {
        if (initialized && !user) { router.push('/login'); return; }
        if (user) {
            enrollmentApi.myEnrollments()
                .then(r => setEnrollments(r.data))
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [user, initialized, router]);

    if (!initialized || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8 max-w-5xl">
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Welcome back, {user?.name}!</h1>
                <p className="text-gray-500 mt-1">Continue where you left off</p>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
                {[
                    { icon: BookOpen, label: 'Enrolled', value: enrollments.length },
                    { icon: Award, label: 'Completed', value: enrollments.filter((e: any) => e.lessonProgress?.length === e.course?.totalLectures).length },
                    { icon: Play, label: 'In Progress', value: enrollments.filter((e: any) => e.lessonProgress?.length > 0).length },
                ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="bg-white border rounded-xl p-4 flex items-center gap-3">
                        <div className="bg-indigo-50 p-2 rounded-lg">
                            <Icon className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold">{value}</p>
                            <p className="text-xs text-gray-500">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            <h2 className="text-lg font-semibold mb-4">My Courses</h2>

            {enrollments.length === 0 ? (
                <div className="text-center py-16 border rounded-xl bg-gray-50">
                    <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">You haven&apos;t enrolled in any courses yet.</p>
                    <Link href="/courses">
                        <Button>Browse Courses</Button>
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {enrollments.map((enrollment: any) => {
                        const course = enrollment.course;
                        const completed = enrollment.lessonProgress?.filter((p: any) => p.isCompleted).length ?? 0;
                        const total = course?.totalLectures ?? 1;
                        const progress = Math.round((completed / total) * 100);

                        return (
                            <Link
                                key={enrollment.id}
                                href={`/courses/${course?.slug}/learn`}
                                className="group bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                            >
                                <div className="aspect-video bg-gray-100">
                                    {course?.thumbnail
                                        ? <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
                                        : <div className="w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                                            <span className="text-xl font-bold text-indigo-300">{course?.title?.[0]}</span>
                                        </div>}
                                </div>
                                <div className="p-4">
                                    <h3 className="font-medium text-sm line-clamp-2 group-hover:text-indigo-600">{course?.title}</h3>
                                    <div className="mt-3">
                                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                                            <span>{progress}% complete</span>
                                            <span>{completed}/{total} lessons</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-indigo-500 rounded-full"
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
