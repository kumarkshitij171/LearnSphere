'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { coursesApi, categoriesApi } from '@/lib/api';
import { CourseCard } from '@/components/course/course-card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const SORTS = [
    { value: 'newest', label: 'Newest' },
    { value: 'popular', label: 'Most Popular' },
    { value: 'rating', label: 'Highest Rated' },
];

function CourseCatalog() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [courses, setCourses] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [nextCursor, setNextCursor] = useState<string | null>(null);

    const [search, setSearch] = useState(searchParams.get('search') ?? '');
    const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '');
    const [level, setLevel] = useState('');
    const [sortBy, setSortBy] = useState('newest');

    useEffect(() => {
        categoriesApi.list().then(r => setCategories(r.data)).catch(() => {});
    }, []);

    useEffect(() => {
        fetchCourses(false);
    }, [categoryId, level, sortBy]);

    const fetchCourses = async (append = false, cursor?: string) => {
        setLoading(true);
        try {
            const params: any = { sortBy, limit: 20 };
            if (search) params.search = search;
            if (categoryId) params.categoryId = categoryId;
            if (level) params.level = level;
            if (cursor) params.cursor = cursor;

            const res = await coursesApi.list(params);
            const { items, nextCursor: nc } = res.data;
            setCourses(prev => append ? [...prev, ...items] : items);
            setNextCursor(nc);
        } catch {} finally { setLoading(false); }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchCourses(false);
    };

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            <h1 className="text-2xl font-bold mb-6">Browse Courses</h1>

            <div className="flex flex-col md:flex-row gap-6">
                {/* Filters sidebar */}
                <aside className="w-full md:w-64 shrink-0 space-y-6">
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search courses..."
                        />
                        <Button type="submit" size="icon" variant="outline">
                            <Search className="h-4 w-4" />
                        </Button>
                    </form>

                    <div>
                        <h3 className="font-semibold text-sm mb-2">Category</h3>
                        <div className="space-y-1">
                            <button
                                onClick={() => setCategoryId('')}
                                className={`block w-full text-left text-sm px-2 py-1 rounded hover:bg-gray-50 ${!categoryId ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}
                            >
                                All Categories
                            </button>
                            {categories.map((cat: any) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategoryId(cat.id)}
                                    className={`block w-full text-left text-sm px-2 py-1 rounded hover:bg-gray-50 ${categoryId === cat.id ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}
                                >
                                    {cat.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold text-sm mb-2">Level</h3>
                        <div className="space-y-1">
                            <button onClick={() => setLevel('')} className={`block w-full text-left text-sm px-2 py-1 rounded ${!level ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}>All Levels</button>
                            {LEVELS.map(l => (
                                <button key={l} onClick={() => setLevel(l)} className={`block w-full text-left text-sm px-2 py-1 rounded ${level === l ? 'text-indigo-600 font-medium' : 'text-gray-700'}`}>
                                    {l.charAt(0) + l.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                </aside>

                {/* Course grid */}
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-4">
                        <p className="text-sm text-gray-500">{courses.length} courses found</p>
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value)}
                            className="text-sm border rounded-lg px-3 py-1.5"
                        >
                            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                    </div>

                    {loading && courses.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="rounded-xl border bg-gray-100 aspect-[4/3] animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {courses.map((course: any) => (
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
                            {nextCursor && (
                                <div className="mt-8 text-center">
                                    <Button
                                        variant="outline"
                                        onClick={() => fetchCourses(true, nextCursor)}
                                        disabled={loading}
                                    >
                                        Load More
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function CoursesPage() {
    return <Suspense><CourseCatalog /></Suspense>;
}
