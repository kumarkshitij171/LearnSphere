'use client';

import Link from 'next/link';
import { Star, Users } from 'lucide-react';

interface CourseCardProps {
    id: string;
    slug: string;
    title: string;
    thumbnail?: string;
    price: number;
    rating: number;
    totalStudents: number;
    level: string;
    instructorName: string;
}

export function CourseCard({ id, slug, title, thumbnail, price, rating, totalStudents, level, instructorName }: CourseCardProps) {
    return (
        <Link href={`/courses/${slug}`} className="group block rounded-xl border bg-white hover:shadow-md transition-shadow overflow-hidden">
            <div className="aspect-video bg-gray-100 relative overflow-hidden">
                {thumbnail ? (
                    <img src={thumbnail} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                        <span className="text-2xl font-bold text-indigo-300">{title[0]}</span>
                    </div>
                )}
                <span className="absolute top-2 right-2 bg-white text-xs font-medium px-2 py-0.5 rounded-full shadow">
                    {level}
                </span>
            </div>
            <div className="p-4 space-y-2">
                <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-indigo-600 transition-colors">{title}</h3>
                <p className="text-xs text-gray-500">{instructorName}</p>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-amber-500">
                        <Star className="h-3 w-3 fill-current" />
                        <span className="font-medium">{rating.toFixed(1)}</span>
                        <span className="text-gray-400 flex items-center gap-0.5">
                            <Users className="h-3 w-3" /> {totalStudents.toLocaleString()}
                        </span>
                    </div>
                    <span className="font-bold text-sm text-indigo-600">
                        {price === 0 ? 'Free' : `$${price}`}
                    </span>
                </div>
            </div>
        </Link>
    );
}
