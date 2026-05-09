'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { BookOpen, Bell, LogOut, User, LayoutDashboard, Award } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchMe, logoutUser } from '@/store/slices/authSlice';
import { Button } from '@/components/ui/button';

export function Navbar() {
    const dispatch = useAppDispatch();
    const { user, initialized } = useAppSelector(s => s.auth);

    useEffect(() => {
        if (!initialized) dispatch(fetchMe());
    }, [initialized, dispatch]);

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-sm">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
                <Link href="/" className="flex items-center gap-2 font-bold text-xl text-indigo-600">
                    <BookOpen className="h-6 w-6" />
                    <span>LMS</span>
                </Link>

                <nav className="hidden md:flex items-center gap-6">
                    <Link href="/courses" className="text-sm text-gray-600 hover:text-indigo-600 transition-colors">
                        Browse Courses
                    </Link>
                    {user?.role === 'INSTRUCTOR' && (
                        <Link href="/instructor/dashboard" className="text-sm text-gray-600 hover:text-indigo-600 transition-colors">
                            Instructor
                        </Link>
                    )}
                    {user?.role === 'ADMIN' && (
                        <Link href="/admin/dashboard" className="text-sm text-gray-600 hover:text-indigo-600 transition-colors">
                            Admin
                        </Link>
                    )}
                </nav>

                <div className="flex items-center gap-3">
                    {user ? (
                        <>
                            <Link href="/dashboard" className="text-gray-600 hover:text-indigo-600">
                                <LayoutDashboard className="h-5 w-5" />
                            </Link>
                            <button className="text-gray-600 hover:text-indigo-600">
                                <Bell className="h-5 w-5" />
                            </button>
                            <div className="relative group">
                                <button className="flex items-center gap-2 rounded-full border p-1 hover:bg-gray-50">
                                    {user.avatar ? (
                                        <img src={user.avatar} alt={user.name} className="h-7 w-7 rounded-full object-cover" />
                                    ) : (
                                        <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center">
                                            <span className="text-xs font-medium text-indigo-600">{user.name[0]}</span>
                                        </div>
                                    )}
                                </button>
                                <div className="absolute right-0 top-full mt-1 hidden group-hover:block w-48 bg-white border rounded-lg shadow-lg py-1 z-50">
                                    <Link href="/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                        <User className="h-4 w-4" /> Profile
                                    </Link>
                                    <Link href="/certificates" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                        <Award className="h-4 w-4" /> Certificates
                                    </Link>
                                    <button
                                        onClick={() => dispatch(logoutUser())}
                                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                        <LogOut className="h-4 w-4" /> Logout
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <Link href="/login">
                                <Button variant="ghost" size="sm">Login</Button>
                            </Link>
                            <Link href="/signup">
                                <Button size="sm">Sign Up</Button>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
