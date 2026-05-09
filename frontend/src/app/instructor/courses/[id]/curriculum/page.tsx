'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { coursesApi, sectionsApi, lessonsApi, videoApi } from '@/lib/api';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Upload, Loader2, Film, FileText, CheckCircle2 } from 'lucide-react';

type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function CurriculumPage() {
    const { id: courseId } = useParams<{ id: string }>();
    const router = useRouter();
    const user = useAppSelector(s => s.auth.user);

    const [course, setCourse] = useState<any>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [newSectionTitle, setNewSectionTitle] = useState('');
    const [addingSection, setAddingSection] = useState(false);
    const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState('');
    const [newLessonData, setNewLessonData] = useState<Record<string, { title: string; type: string }>>({});
    const [addingLessonFor, setAddingLessonFor] = useState<string | null>(null);
    const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingLessonRef = useRef<{ sectionId: string; lessonId: string } | null>(null);

    useEffect(() => {
        if (!user || (user.role !== 'INSTRUCTOR' && user.role !== 'ADMIN')) {
            router.push('/dashboard'); return;
        }
        loadCourse();
    }, [user, courseId]);

    const loadCourse = () => {
        coursesApi.getById(courseId).then(r => {
            setCourse(r.data);
            if (r.data.sections?.length) {
                setExpandedSections(new Set(r.data.sections.map((s: any) => s.id)));
            }
        }).catch(() => toast.error('Failed to load course'));
    };

    const handleAddSection = async () => {
        if (!newSectionTitle.trim()) return;
        try {
            await sectionsApi.create(courseId, { title: newSectionTitle });
            setNewSectionTitle('');
            setAddingSection(false);
            loadCourse();
            toast.success('Section added');
        } catch { toast.error('Failed to add section'); }
    };

    const handleUpdateSection = async (sectionId: string) => {
        if (!editingTitle.trim()) return;
        try {
            await sectionsApi.update(courseId, sectionId, { title: editingTitle });
            setEditingSectionId(null);
            loadCourse();
        } catch { toast.error('Failed to update section'); }
    };

    const handleDeleteSection = async (sectionId: string) => {
        if (!confirm('Delete this section and all its lessons?')) return;
        try {
            await sectionsApi.remove(courseId, sectionId);
            loadCourse();
            toast.success('Section deleted');
        } catch { toast.error('Failed to delete section'); }
    };

    const handleAddLesson = async (sectionId: string) => {
        const data = newLessonData[sectionId];
        if (!data?.title?.trim()) return;
        try {
            const res = await lessonsApi.create(sectionId, {
                title: data.title,
                type: data.type || 'VIDEO',
                isFree: false,
            });
            setNewLessonData(prev => ({ ...prev, [sectionId]: { title: '', type: 'VIDEO' } }));
            setAddingLessonFor(null);
            loadCourse();
            toast.success('Lesson added');
        } catch { toast.error('Failed to add lesson'); }
    };

    const handleDeleteLesson = async (lessonId: string) => {
        if (!confirm('Delete this lesson?')) return;
        try {
            await lessonsApi.remove(lessonId);
            loadCourse();
            toast.success('Lesson deleted');
        } catch { toast.error('Failed to delete lesson'); }
    };

    const handleToggleFree = async (lessonId: string, isFree: boolean) => {
        try {
            await lessonsApi.update(lessonId, { isFree: !isFree });
            loadCourse();
        } catch { toast.error('Failed to update lesson'); }
    };

    const handleUploadVideo = async (sectionId: string, lessonId: string) => {
        pendingLessonRef.current = { sectionId, lessonId };
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !pendingLessonRef.current) return;
        const { lessonId } = pendingLessonRef.current;
        e.target.value = '';

        setUploadStates(prev => ({ ...prev, [lessonId]: 'uploading' }));
        try {
            const presignRes = await videoApi.presign(file.type);
            const { uploadUrl, videoId } = presignRes.data;

            await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });

            await videoApi.confirm({ videoId, originalFilename: file.name, size: file.size, mimeType: file.type });

            await lessonsApi.update(lessonId, { videoId });

            setUploadStates(prev => ({ ...prev, [lessonId]: 'done' }));
            toast.success('Video uploaded — transcoding in progress');
            loadCourse();
        } catch (err) {
            setUploadStates(prev => ({ ...prev, [lessonId]: 'error' }));
            toast.error('Upload failed');
        }
    };

    const toggleSection = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    if (!course) {
        return <div className="flex justify-center items-center min-h-[60vh]"><p className="text-gray-500">Loading...</p></div>;
    }

    return (
        <div className="container mx-auto max-w-4xl px-4 py-8">
            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Curriculum</h1>
                    <p className="text-sm text-gray-500 mt-1 truncate max-w-lg">{course.title}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => router.push(`/instructor/courses/${courseId}/edit`)}>
                    Edit Details
                </Button>
            </div>

            <div className="space-y-3">
                {(course.sections ?? []).map((section: any) => (
                    <div key={section.id} className="border rounded-xl bg-white overflow-hidden">
                        {/* Section header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
                            <GripVertical className="h-4 w-4 text-gray-300 shrink-0" />
                            {editingSectionId === section.id ? (
                                <div className="flex flex-1 gap-2">
                                    <Input
                                        value={editingTitle}
                                        onChange={e => setEditingTitle(e.target.value)}
                                        className="h-8 text-sm"
                                        onKeyDown={e => { if (e.key === 'Enter') handleUpdateSection(section.id); if (e.key === 'Escape') setEditingSectionId(null); }}
                                        autoFocus
                                    />
                                    <Button size="sm" onClick={() => handleUpdateSection(section.id)}>Save</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingSectionId(null)}>Cancel</Button>
                                </div>
                            ) : (
                                <>
                                    <button
                                        className="flex-1 text-left font-medium text-sm"
                                        onDoubleClick={() => { setEditingSectionId(section.id); setEditingTitle(section.title); }}
                                        onClick={() => toggleSection(section.id)}
                                    >
                                        {section.title}
                                        <span className="ml-2 text-xs text-gray-400 font-normal">{section.lessons?.length ?? 0} lessons</span>
                                    </button>
                                    <button onClick={() => { setEditingSectionId(section.id); setEditingTitle(section.title); }} className="text-gray-400 hover:text-gray-600 text-xs">Edit</button>
                                    <button onClick={() => handleDeleteSection(section.id)} className="text-red-400 hover:text-red-600">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => toggleSection(section.id)}>
                                        {expandedSections.has(section.id) ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Lessons */}
                        {expandedSections.has(section.id) && (
                            <div className="divide-y border-t">
                                {(section.lessons ?? []).map((lesson: any) => {
                                    const uploadState = uploadStates[lesson.id];
                                    return (
                                        <div key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                                            <GripVertical className="h-4 w-4 text-gray-200 shrink-0" />
                                            {lesson.type === 'VIDEO' ? <Film className="h-4 w-4 text-indigo-400 shrink-0" /> : <FileText className="h-4 w-4 text-green-400 shrink-0" />}
                                            <span className="flex-1 text-sm">{lesson.title}</span>
                                            {lesson.videoId && (
                                                <span className="text-xs text-green-600 flex items-center gap-1">
                                                    <CheckCircle2 className="h-3 w-3" /> Video ready
                                                </span>
                                            )}
                                            {uploadState === 'uploading' && (
                                                <span className="text-xs text-indigo-600 flex items-center gap-1">
                                                    <Loader2 className="h-3 w-3 animate-spin" /> Uploading...
                                                </span>
                                            )}
                                            {uploadState === 'done' && !lesson.videoId && (
                                                <span className="text-xs text-amber-600">Processing...</span>
                                            )}
                                            <button
                                                onClick={() => handleToggleFree(lesson.id, lesson.isFree)}
                                                className={`text-xs px-2 py-0.5 rounded-full border ${lesson.isFree ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                                            >
                                                {lesson.isFree ? 'Free preview' : 'Paid'}
                                            </button>
                                            {lesson.type === 'VIDEO' && !lesson.videoId && (
                                                <Button size="sm" variant="outline" onClick={() => handleUploadVideo(section.id, lesson.id)}>
                                                    <Upload className="h-3 w-3 mr-1" /> Upload
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => handleDeleteLesson(lesson.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    );
                                })}

                                {/* Add lesson */}
                                {addingLessonFor === section.id ? (
                                    <div className="flex items-center gap-2 px-4 py-3">
                                        <Input
                                            placeholder="Lesson title"
                                            value={newLessonData[section.id]?.title ?? ''}
                                            onChange={e => setNewLessonData(prev => ({ ...prev, [section.id]: { ...prev[section.id], title: e.target.value } }))}
                                            className="h-8 text-sm"
                                            onKeyDown={e => { if (e.key === 'Enter') handleAddLesson(section.id); }}
                                            autoFocus
                                        />
                                        <select
                                            value={newLessonData[section.id]?.type ?? 'VIDEO'}
                                            onChange={e => setNewLessonData(prev => ({ ...prev, [section.id]: { ...prev[section.id], type: e.target.value } }))}
                                            className="border rounded px-2 py-1.5 text-xs focus:outline-none"
                                        >
                                            <option value="VIDEO">Video</option>
                                            <option value="ARTICLE">Article</option>
                                            <option value="QUIZ">Quiz</option>
                                        </select>
                                        <Button size="sm" onClick={() => handleAddLesson(section.id)}>Add</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setAddingLessonFor(null)}>Cancel</Button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => { setAddingLessonFor(section.id); setNewLessonData(prev => ({ ...prev, [section.id]: { title: '', type: 'VIDEO' } })); }}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
                                    >
                                        <Plus className="h-4 w-4" /> Add lesson
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}

                {/* Add section */}
                {addingSection ? (
                    <div className="border rounded-xl p-4 bg-white flex gap-2">
                        <Input
                            placeholder="Section title"
                            value={newSectionTitle}
                            onChange={e => setNewSectionTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') setAddingSection(false); }}
                            autoFocus
                        />
                        <Button onClick={handleAddSection}>Add</Button>
                        <Button variant="ghost" onClick={() => setAddingSection(false)}>Cancel</Button>
                    </div>
                ) : (
                    <Button variant="outline" className="w-full" onClick={() => setAddingSection(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Add Section
                    </Button>
                )}
            </div>
        </div>
    );
}
