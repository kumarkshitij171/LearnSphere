'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { coursesApi, categoriesApi } from '@/lib/api';
import { CourseCard } from '@/components/course/course-card';
import { Button } from '@/components/ui/button';
import { BookOpen, Users, Award, Play } from 'lucide-react';

export default function LandingPage() {
    const [featured, setFeatured] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);

    useEffect(() => {
        coursesApi.featured().then(r => setFeatured(r.data)).catch(() => {});
        categoriesApi.list().then(r => setCategories(r.data)).catch(() => {});
    }, []);

    return (
        <div className="min-h-screen">
            {/* Hero */}
            <section className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white py-24 px-4">
                <div className="container mx-auto max-w-4xl text-center space-y-6">
                    <h1 className="text-5xl font-extrabold leading-tight">
                        Learn Without Limits
                    </h1>
                    <p className="text-xl text-indigo-100 max-w-2xl mx-auto">
                        Access thousands of courses taught by expert instructors. Advance your career, explore new hobbies, or learn something completely new.
                    </p>
                    <div className="flex justify-center gap-4">
                        <Link href="/courses">
                            <Button size="lg" className="bg-white text-indigo-600 hover:bg-indigo-50">
                                Browse Courses
                            </Button>
                        </Link>
                        <Link href="/signup">
                            <Button size="lg" variant="outline" className="text-white border-white hover:bg-white/10">
                                Get Started Free
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Stats */}
            <section className="py-12 bg-white border-b">
                <div className="container mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center px-4">
                    {[
                        { icon: BookOpen, label: 'Courses', value: '500+' },
                        { icon: Users, label: 'Students', value: '50K+' },
                        { icon: Award, label: 'Instructors', value: '200+' },
                        { icon: Play, label: 'Video Hours', value: '10K+' },
                    ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="space-y-2">
                            <Icon className="h-8 w-8 text-indigo-500 mx-auto" />
                            <p className="text-2xl font-bold text-gray-900">{value}</p>
                            <p className="text-sm text-gray-500">{label}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Categories */}
            {categories.length > 0 && (
                <section className="py-16 px-4 bg-gray-50">
                    <div className="container mx-auto">
                        <h2 className="text-2xl font-bold text-center mb-8">Browse by Category</h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {categories.slice(0, 12).map((cat: any) => (
                                <Link
                                    key={cat.id}
                                    href={`/courses?categoryId=${cat.id}`}
                                    className="flex flex-col items-center p-4 rounded-xl border bg-white hover:border-indigo-300 hover:shadow-sm transition-all text-center"
                                >
                                    <span className="font-medium text-sm text-gray-700">{cat.name}</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Featured Courses */}
            {featured.length > 0 && (
                <section className="py-16 px-4">
                    <div className="container mx-auto">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold">Featured Courses</h2>
                            <Link href="/courses" className="text-sm text-indigo-600 hover:underline">View all →</Link>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {featured.map((course: any) => (
                                <CourseCard
                                    key={course.id}
                                    id={course.id}
                                    slug={course.slug}
                                    title={course.title}
                                    thumbnail={course.thumbnail}
                                    price={course.price}
                                    rating={course.rating}
                                    totalStudents={course.totalStudents}
                                    level={course.level}
                                    instructorName={course.instructor?.user?.name ?? 'Instructor'}
                                />
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* CTA */}
            <section className="py-20 px-4 bg-indigo-600 text-white text-center">
                <div className="container mx-auto max-w-2xl space-y-4">
                    <h2 className="text-3xl font-bold">Become an Instructor</h2>
                    <p className="text-indigo-100">Share your expertise and earn revenue teaching what you love.</p>
                    <Link href="/signup">
                        <Button size="lg" className="bg-white text-indigo-600 hover:bg-indigo-50">
                            Start Teaching Today
                        </Button>
                    </Link>
                </div>
            </section>
        </div>
    );
}
