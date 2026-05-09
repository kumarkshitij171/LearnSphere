'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { certificatesApi } from '@/lib/api';
import { useAppSelector } from '@/store/hooks';
import { Award, ExternalLink, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CertificatesPage() {
    const router = useRouter();
    const user = useAppSelector(s => s.auth.user);
    const [certificates, setCertificates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) { router.push('/login'); return; }
        certificatesApi.myCertificates()
            .then(r => setCertificates(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [user, router]);

    if (loading) return <div className="flex justify-center items-center min-h-[60vh]"><p className="text-gray-500">Loading...</p></div>;

    return (
        <div className="container mx-auto px-4 py-8 max-w-4xl">
            <div className="flex items-center gap-3 mb-8">
                <Award className="h-7 w-7 text-indigo-600" />
                <h1 className="text-2xl font-bold">My Certificates</h1>
            </div>

            {certificates.length === 0 ? (
                <div className="text-center py-16 border rounded-xl bg-gray-50">
                    <Award className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                    <p className="text-gray-500 mb-2">No certificates yet</p>
                    <p className="text-sm text-gray-400">Complete a course to earn your first certificate</p>
                    <Button className="mt-4" onClick={() => router.push('/courses')}>Browse Courses</Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {certificates.map((cert: any) => (
                        <div key={cert.id} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            {/* Certificate preview */}
                            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-b p-8 text-center">
                                <Award className="h-12 w-12 text-indigo-600 mx-auto mb-3" />
                                <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Certificate of Completion</p>
                                <p className="font-semibold text-gray-800">{cert.course?.title ?? cert.courseTitle}</p>
                                <p className="text-sm text-gray-500 mt-2">Awarded to <span className="font-medium text-gray-700">{user?.name}</span></p>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Issued: {new Date(cert.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                                    <span className="font-mono">#{cert.verificationUuid?.slice(0, 8).toUpperCase()}</span>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => window.open(`/certificates/verify/${cert.verificationUuid}`, '_blank')}
                                    >
                                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Verify
                                    </Button>
                                    {cert.pdfUrl && (
                                        <Button
                                            size="sm"
                                            className="flex-1"
                                            onClick={() => window.open(cert.pdfUrl, '_blank')}
                                        >
                                            <Download className="h-3.5 w-3.5 mr-1" /> Download
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
