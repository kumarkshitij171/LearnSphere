'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { coursesApi, enrollmentApi, ordersApi } from '@/lib/api';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Star, Users, Clock, BookOpen, ChevronDown, ChevronUp, Lock, Play } from 'lucide-react';

export default function CourseDetailPage() {
    const { slug } = useParams<{ slug: string }>();
    const router = useRouter();
    const user = useAppSelector(s => s.auth.user);
    const [course, setCourse] = useState<any>(null);
    const [enrolled, setEnrolled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [enrolling, setEnrolling] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    useEffect(() => {
        coursesApi.getBySlug(slug)
            .then(r => setCourse(r.data))
            .catch(() => toast.error('Course not found'))
            .finally(() => setLoading(false));

        if (user) {
            enrollmentApi.detail(slug).then(() => setEnrolled(true)).catch(() => {});
        }
    }, [slug, user]);

    const handleEnroll = async () => {
        if (!user) { router.push('/login'); return; }
        setEnrolling(true);
        try {
            if (course.price === 0) {
                await enrollmentApi.enrollFree(course.id);
                setEnrolled(true);
                toast.success('Enrolled successfully!');
            } else {
                const res = await ordersApi.checkout(course.id);
                router.push(`/checkout?clientSecret=${res.data.clientSecret}&courseId=${course.id}`);
            }
        } catch (err: any) {
            toast.error(err.response?.data?.message ?? 'Enrollment failed');
        } finally {
            setEnrolling(false);
        }
    };

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
            return next;
        });
    };

    if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><p className="text-gray-500">Loading...</p></div>;
    if (!course) return <div className="text-center py-16"><p>Course not found</p></div>;

    const totalLessons = course.sections?.reduce((s: number, sec: any) => s + sec.lessons.length, 0) ?? 0;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Hero banner */}
            <div className="bg-gray-900 text-white py-12 px-4">
                <div className="container mx-auto max-w-6xl grid md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-4">
                        <p className="text-indigo-400 text-sm font-medium">{course.category?.name}</p>
                        <h1 className="text-3xl font-bold">{course.title}</h1>
                        <p className="text-gray-300">{course.description?.slice(0, 200)}...</p>
                        <div className="flex flex-wrap gap-4 text-sm">
                            <span className="flex items-center gap-1">
                                <Star className="h-4 w-4 text-amber-400 fill-current" />
                                <span className="font-semibold">{course.rating?.toFixed(1)}</span>
                                <span className="text-gray-400">({course.reviewCount} reviews)</span>
                            </span>
                            <span className="flex items-center gap-1 text-gray-400">
                                <Users className="h-4 w-4" /> {course.totalStudents?.toLocaleString()} students
                            </span>
                            <span className="flex items-center gap-1 text-gray-400">
                                <Clock className="h-4 w-4" /> {Math.round((course.totalDuration ?? 0) / 3600)}h total
                            </span>
                            <span className="flex items-center gap-1 text-gray-400">
                                <BookOpen className="h-4 w-4" /> {totalLessons} lessons
                            </span>
                        </div>
                        <p className="text-gray-400 text-sm">
                            By <span className="text-white font-medium">{course.instructor?.user?.name}</span>
                        </p>
                    </div>

                    {/* Enroll card (desktop) */}
                    <div className="hidden md:block">
                        <EnrollCard course={course} enrolled={enrolled} enrolling={enrolling} onEnroll={handleEnroll} />
                    </div>
                </div>
            </div>

            <div className="container mx-auto max-w-6xl px-4 py-8 grid md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-8">
                    {/* What you'll learn */}
                    {course.learnings?.length > 0 && (
                        <section className="bg-white border rounded-xl p-6">
                            <h2 className="font-bold text-lg mb-4">What you&apos;ll learn</h2>
                            <ul className="grid grid-cols-2 gap-2">
                                {course.learnings.map((l: string, i: number) => (
                                    <li key={i} className="flex items-start gap-2 text-sm">
                                        <span className="text-indigo-500 mt-0.5">✓</span>
                                        {l}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* Curriculum */}
                    <section>
                        <h2 className="font-bold text-lg mb-4">Course Curriculum</h2>
                        <div className="space-y-2">
                            {course.sections?.map((section: any) => (
                                <div key={section.id} className="border rounded-xl bg-white overflow-hidden">
                                    <button
                                        onClick={() => toggleSection(section.id)}
                                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
                                    >
                                        <span className="font-medium text-sm">{section.title}</span>
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <span>{section.lessons.length} lessons</span>
                                            {expandedSections.has(section.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                        </div>
                                    </button>
                                    {expandedSections.has(section.id) && (
                                        <div className="border-t divide-y">
                                            {section.lessons.map((lesson: any) => (
                                                <div key={lesson.id} className="flex items-center gap-3 px-4 py-2.5">
                                                    {lesson.isFree ? (
                                                        <Play className="h-4 w-4 text-indigo-500" />
                                                    ) : (
                                                        <Lock className="h-4 w-4 text-gray-400" />
                                                    )}
                                                    <span className="text-sm">{lesson.title}</span>
                                                    {lesson.isFree && <span className="ml-auto text-xs text-indigo-600 font-medium">Preview</span>}
                                                    {lesson.duration && (
                                                        <span className="text-xs text-gray-400">{Math.round(lesson.duration / 60)}m</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Enroll card (mobile) + sidebar */}
                <div className="md:hidden">
                    <EnrollCard course={course} enrolled={enrolled} enrolling={enrolling} onEnroll={handleEnroll} />
                </div>
            </div>
        </div>
    );
}

function EnrollCard({ course, enrolled, enrolling, onEnroll }: any) {
    const router = useRouter();

    return (
        <div className="bg-white border rounded-xl shadow-lg p-6 space-y-4 sticky top-20">
            {course.thumbnail && (
                <img src={course.thumbnail} alt={course.title} className="w-full aspect-video object-cover rounded-lg" />
            )}
            <div className="text-3xl font-bold text-indigo-600">
                {course.price === 0 ? 'Free' : `$${course.price}`}
            </div>
            {enrolled ? (
                <Button className="w-full" onClick={() => router.push(`/courses/${course.slug}/learn`)}>
                    Continue Learning
                </Button>
            ) : (
                <Button className="w-full" onClick={onEnroll} disabled={enrolling}>
                    {enrolling ? 'Processing...' : course.price === 0 ? 'Enroll for Free' : 'Buy Now'}
                </Button>
            )}
            <p className="text-xs text-center text-gray-400">30-day money-back guarantee</p>
        </div>
    );
}
