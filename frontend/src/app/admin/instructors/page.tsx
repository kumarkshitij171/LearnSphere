'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CheckSquare, XSquare } from 'lucide-react';

export default function AdminInstructorsPage() {
    const router = useRouter();
    const user = useAppSelector(s => s.auth.user);
    const [applications, setApplications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user !== undefined && user?.role !== 'ADMIN') { router.push('/dashboard'); return; }
        if (user?.role === 'ADMIN') {
            adminApi.instructorApplications()
                .then(r => setApplications(r.data))
                .catch(() => toast.error('Failed to load applications'))
                .finally(() => setLoading(false));
        }
    }, [user, router]);

    const handleApprove = async (id: string) => {
        try {
            await adminApi.approveInstructor(id);
            setApplications(prev => prev.filter(a => a.id !== id));
            toast.success('Instructor approved');
        } catch { toast.error('Failed to approve'); }
    };

    const handleReject = async (id: string) => {
        const reason = prompt('Rejection reason:');
        if (!reason) return;
        try {
            await adminApi.rejectInstructor(id, reason);
            setApplications(prev => prev.filter(a => a.id !== id));
            toast.success('Application rejected');
        } catch { toast.error('Failed to reject'); }
    };

    if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><p className="text-gray-500">Loading...</p></div>;

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <h1 className="text-2xl font-bold mb-6">Instructor Applications</h1>

            {applications.length === 0 ? (
                <div className="text-center py-16 border rounded-xl bg-gray-50">
                    <p className="text-gray-400">No pending applications</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {applications.map((profile: any) => (
                        <div key={profile.id} className="bg-white border rounded-xl p-6">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                                            {profile.user?.name?.[0] ?? 'U'}
                                        </div>
                                        <div>
                                            <p className="font-semibold">{profile.user?.name}</p>
                                            <p className="text-xs text-gray-400">{profile.user?.email}</p>
                                        </div>
                                    </div>
                                    {profile.headline && (
                                        <p className="text-sm font-medium text-gray-700 mt-3">{profile.headline}</p>
                                    )}
                                    {profile.bio && (
                                        <p className="text-sm text-gray-500 mt-1 line-clamp-3">{profile.bio}</p>
                                    )}
                                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
                                        {profile.expertise?.length > 0 && (
                                            <span>Expertise: {profile.expertise.join(', ')}</span>
                                        )}
                                        {profile.yearsExperience && (
                                            <span>{profile.yearsExperience} years experience</span>
                                        )}
                                        {profile.linkedinUrl && (
                                            <a href={profile.linkedinUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                                LinkedIn
                                            </a>
                                        )}
                                        {profile.websiteUrl && (
                                            <a href={profile.websiteUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                                Website
                                            </a>
                                        )}
                                    </div>
                                    {profile.teachingMotivation && (
                                        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                            <p className="text-xs text-gray-500 font-medium mb-1">Why they want to teach:</p>
                                            <p className="text-sm text-gray-600">{profile.teachingMotivation}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <Button className="bg-green-600 hover:bg-green-700" size="sm" onClick={() => handleApprove(profile.id)}>
                                        <CheckSquare className="h-4 w-4 mr-1" /> Approve
                                    </Button>
                                    <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50" onClick={() => handleReject(profile.id)}>
                                        <XSquare className="h-4 w-4 mr-1" /> Reject
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
