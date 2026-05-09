'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchMe } from '@/store/slices/authSlice';
import { Users, BookOpen, DollarSign, CheckSquare, XSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function AdminDashboard() {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const { user, initialized } = useAppSelector(s => s.auth);
    const [stats, setStats] = useState<any>(null);
    const [pendingInstructors, setPendingInstructors] = useState<any[]>([]);
    const [reviewCourses, setReviewCourses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (!initialized) dispatch(fetchMe()); }, [initialized, dispatch]);

    useEffect(() => {
        if (initialized && user?.role !== 'ADMIN') { router.push('/dashboard'); return; }
        if (user?.role === 'ADMIN') {
            Promise.all([
                adminApi.stats().then(r => setStats(r.data)),
                adminApi.instructorApplications().then(r => setPendingInstructors(r.data)).catch(() => {}),
                adminApi.allCourses('UNDER_REVIEW').then(r => setReviewCourses(r.data)).catch(() => {}),
            ]).finally(() => setLoading(false));
        }
    }, [user, initialized, router]);

    const handleApproveInstructor = async (id: string) => {
        try {
            await adminApi.approveInstructor(id);
            setPendingInstructors(prev => prev.filter(p => p.id !== id));
            toast.success('Instructor approved');
        } catch { toast.error('Failed to approve'); }
    };

    const handleRejectInstructor = async (id: string) => {
        const reason = prompt('Rejection reason:');
        if (!reason) return;
        try {
            await adminApi.rejectInstructor(id, reason);
            setPendingInstructors(prev => prev.filter(p => p.id !== id));
            toast.success('Instructor rejected');
        } catch { toast.error('Failed to reject'); }
    };

    const handlePublishCourse = async (id: string) => {
        try {
            await adminApi.publishCourse(id);
            setReviewCourses(prev => prev.filter(c => c.id !== id));
            toast.success('Course published');
        } catch { toast.error('Failed to publish'); }
    };

    const handleRejectCourse = async (id: string) => {
        const feedback = prompt('Rejection feedback:');
        if (!feedback) return;
        try {
            await adminApi.rejectCourse(id, feedback);
            setReviewCourses(prev => prev.filter(c => c.id !== id));
            toast.success('Course sent back to draft');
        } catch { toast.error('Failed to reject'); }
    };

    if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><p>Loading...</p></div>;

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>

            {/* Stats */}
            {stats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { icon: Users, label: 'Total Users', value: stats.totalUsers },
                        { icon: BookOpen, label: 'Published Courses', value: stats.publishedCourses },
                        { icon: DollarSign, label: 'GMV', value: `$${(stats.grossMerchandiseValue ?? 0).toFixed(0)}` },
                        { icon: Users, label: 'Pending Instructors', value: pendingInstructors.length },
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

            <div className="grid md:grid-cols-2 gap-6">
                {/* Instructor Applications */}
                <div className="bg-white border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold">Instructor Applications</h2>
                        <Link href="/admin/instructors" className="text-xs text-indigo-600">View all</Link>
                    </div>
                    {pendingInstructors.length === 0 ? (
                        <p className="text-sm text-gray-400">No pending applications</p>
                    ) : (
                        <div className="space-y-3">
                            {pendingInstructors.slice(0, 5).map((profile: any) => (
                                <div key={profile.id} className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium">{profile.user?.name}</p>
                                        <p className="text-xs text-gray-500">{profile.headline}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleApproveInstructor(profile.id)}>
                                            <CheckSquare className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleRejectInstructor(profile.id)}>
                                            <XSquare className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Courses Under Review */}
                <div className="bg-white border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold">Courses Under Review</h2>
                        <Link href="/admin/courses" className="text-xs text-indigo-600">View all</Link>
                    </div>
                    {reviewCourses.length === 0 ? (
                        <p className="text-sm text-gray-400">No courses pending review</p>
                    ) : (
                        <div className="space-y-3">
                            {reviewCourses.slice(0, 5).map((course: any) => (
                                <div key={course.id} className="flex items-center justify-between">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{course.title}</p>
                                        <p className="text-xs text-gray-500">{course.instructor?.user?.name}</p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handlePublishCourse(course.id)}>
                                            <CheckSquare className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleRejectCourse(course.id)}>
                                            <XSquare className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Top courses */}
            {stats?.topCourses?.length > 0 && (
                <div className="mt-6 bg-white border rounded-xl p-6">
                    <h2 className="font-semibold mb-4">Top Courses by Students</h2>
                    <div className="space-y-2">
                        {stats.topCourses.map((c: any, i: number) => (
                            <div key={c.id} className="flex items-center gap-3">
                                <span className="text-sm text-gray-400 w-5">{i + 1}</span>
                                <p className="flex-1 text-sm">{c.title}</p>
                                <span className="text-sm text-gray-500">{c.totalStudents} students</span>
                                <span className="text-sm text-amber-500">★ {c.rating?.toFixed(1)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
