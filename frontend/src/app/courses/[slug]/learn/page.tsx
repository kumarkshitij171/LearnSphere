'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Hls from 'hls.js';
import { coursesApi, enrollmentApi, lessonsApi, qaApi, videoApi } from '@/lib/api';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, MessageSquare, Send, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function CourseLearnPage() {
    const { slug } = useParams<{ slug: string }>();
    const router = useRouter();
    const user = useAppSelector(s => s.auth.user);

    const [course, setCourse] = useState<any>(null);
    const [enrollment, setEnrollment] = useState<any>(null);
    const [activeLesson, setActiveLesson] = useState<any>(null);
    const [streamUrl, setStreamUrl] = useState<string | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState<'overview' | 'qa'>('overview');
    const [questions, setQuestions] = useState<any[]>([]);
    const [questionText, setQuestionText] = useState('');
    const [answerText, setAnswerText] = useState<Record<string, string>>({});
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const hlsRef = useRef<Hls | null>(null);

    useEffect(() => {
        if (!user) { router.push('/login'); return; }
        coursesApi.getBySlug(slug).then(r => {
            setCourse(r.data);
            const firstLesson = r.data.sections?.[0]?.lessons?.[0];
            if (firstLesson) {
                setExpandedSections(new Set([r.data.sections[0].id]));
                selectLesson(r.data.id, firstLesson);
            }
        }).catch(() => toast.error('Course not found'));

        enrollmentApi.detail(slug).then(r => {
            setEnrollment(r.data);
            const done = new Set<string>(
                (r.data.lessonProgress ?? [])
                    .filter((p: any) => p.isCompleted)
                    .map((p: any) => p.lessonId)
            );
            setCompletedLessons(done);
        }).catch(() => router.push(`/courses/${slug}`));
    }, [slug, user]);

    const selectLesson = useCallback(async (courseId: string, lesson: any) => {
        setActiveLesson(lesson);
        setStreamUrl(null);
        if (lesson.videoId) {
            try {
                const res = await lessonsApi.streamToken(courseId, lesson.id);
                setStreamUrl(res.data.url);
            } catch { /* no stream */ }
        }
        qaApi.listQuestions(lesson.id).then(r => setQuestions(r.data)).catch(() => {});
    }, []);

    useEffect(() => {
        if (!streamUrl || !videoRef.current) return;
        if (hlsRef.current) hlsRef.current.destroy();
        if (Hls.isSupported()) {
            const hls = new Hls();
            hlsRef.current = hls;
            hls.loadSource(streamUrl);
            hls.attachMedia(videoRef.current);
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
            videoRef.current.src = streamUrl;
        }
    }, [streamUrl]);

    const handleVideoEnded = async () => {
        if (!course || !activeLesson || completedLessons.has(activeLesson.id)) return;
        try {
            await enrollmentApi.markComplete(course.id, activeLesson.id);
            setCompletedLessons(prev => new Set([...prev, activeLesson.id]));
            toast.success('Lesson marked as complete!');
            advanceToNextLesson();
        } catch { /* ignore */ }
    };

    const advanceToNextLesson = () => {
        if (!course) return;
        let found = false;
        for (const section of course.sections ?? []) {
            for (const lesson of section.lessons ?? []) {
                if (found) { selectLesson(course.id, lesson); return; }
                if (lesson.id === activeLesson?.id) found = true;
            }
        }
    };

    const toggleSection = (id: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handlePostQuestion = async () => {
        if (!questionText.trim() || !activeLesson) return;
        try {
            const res = await qaApi.postQuestion(activeLesson.id, { body: questionText });
            setQuestions(prev => [res.data, ...prev]);
            setQuestionText('');
        } catch { toast.error('Failed to post question'); }
    };

    const handlePostAnswer = async (questionId: string) => {
        const body = answerText[questionId]?.trim();
        if (!body) return;
        try {
            const res = await qaApi.postAnswer(questionId, { body });
            setQuestions(prev => prev.map(q =>
                q.id === questionId ? { ...q, answers: [...(q.answers ?? []), res.data] } : q
            ));
            setAnswerText(prev => ({ ...prev, [questionId]: '' }));
            setReplyingTo(null);
        } catch { toast.error('Failed to post answer'); }
    };

    const totalLessons = course?.sections?.reduce((s: number, sec: any) => s + sec.lessons.length, 0) ?? 0;
    const progressPct = totalLessons > 0 ? Math.round((completedLessons.size / totalLessons) * 100) : 0;

    if (!course) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <p className="text-gray-500">Loading course...</p>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-gray-950">
            {/* Sidebar */}
            <aside className="w-80 bg-gray-900 text-white flex flex-col border-r border-gray-800 overflow-hidden shrink-0">
                <div className="p-4 border-b border-gray-800">
                    <h2 className="font-semibold text-sm truncate">{course.title}</h2>
                    <div className="mt-2">
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>{completedLessons.size}/{totalLessons} lessons</span>
                            <span>{progressPct}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {course.sections?.map((section: any) => (
                        <div key={section.id}>
                            <button
                                onClick={() => toggleSection(section.id)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800 transition-colors"
                            >
                                <span className="text-sm font-medium">{section.title}</span>
                                {expandedSections.has(section.id) ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                            </button>
                            {expandedSections.has(section.id) && (
                                <div>
                                    {section.lessons.map((lesson: any) => {
                                        const isActive = activeLesson?.id === lesson.id;
                                        const isDone = completedLessons.has(lesson.id);
                                        return (
                                            <button
                                                key={lesson.id}
                                                onClick={() => selectLesson(course.id, lesson)}
                                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isActive ? 'bg-indigo-600' : 'hover:bg-gray-800'}`}
                                            >
                                                {isDone
                                                    ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                                                    : <Circle className="h-4 w-4 text-gray-500 shrink-0" />
                                                }
                                                <span className="text-xs">{lesson.title}</span>
                                                {lesson.duration && (
                                                    <span className="ml-auto text-xs text-gray-400 shrink-0">{Math.round(lesson.duration / 60)}m</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
                {streamUrl ? (
                    <div className="aspect-video bg-black w-full">
                        <video
                            ref={videoRef}
                            className="w-full h-full"
                            controls
                            onEnded={handleVideoEnded}
                        />
                    </div>
                ) : (
                    <div className="aspect-video bg-gray-900 w-full flex items-center justify-center">
                        <div className="text-center text-gray-400">
                            <Lock className="h-12 w-12 mx-auto mb-3" />
                            <p className="text-sm">
                                {activeLesson ? 'No video for this lesson' : 'Select a lesson to begin'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Lesson content area */}
                <div className="flex-1 overflow-y-auto bg-white">
                    {activeLesson && (
                        <>
                            <div className="border-b">
                                <div className="container mx-auto max-w-4xl px-6 pt-6 pb-0">
                                    <h1 className="text-xl font-bold mb-4">{activeLesson.title}</h1>
                                    <div className="flex gap-6 border-b -mb-px">
                                        {(['overview', 'qa'] as const).map(tab => (
                                            <button
                                                key={tab}
                                                onClick={() => setActiveTab(tab)}
                                                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                            >
                                                {tab === 'overview' ? 'Overview' : 'Q&A'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="container mx-auto max-w-4xl px-6 py-6">
                                {activeTab === 'overview' && (
                                    <div className="prose max-w-none">
                                        {activeLesson.content
                                            ? <p className="text-gray-700 whitespace-pre-wrap">{activeLesson.content}</p>
                                            : <p className="text-gray-400 text-sm">No additional notes for this lesson.</p>
                                        }
                                    </div>
                                )}
                                {activeTab === 'qa' && (
                                    <div className="space-y-6">
                                        {/* Post question */}
                                        <div className="space-y-2">
                                            <Textarea
                                                placeholder="Ask a question about this lesson..."
                                                value={questionText}
                                                onChange={e => setQuestionText(e.target.value)}
                                                rows={3}
                                            />
                                            <Button size="sm" onClick={handlePostQuestion} disabled={!questionText.trim()}>
                                                <Send className="h-3 w-3 mr-1" /> Ask Question
                                            </Button>
                                        </div>
                                        {questions.length === 0 ? (
                                            <p className="text-gray-400 text-sm text-center py-8">No questions yet. Be the first to ask!</p>
                                        ) : (
                                            <div className="space-y-4">
                                                {questions.map((q: any) => (
                                                    <div key={q.id} className="border rounded-xl p-4 space-y-3">
                                                        <div className="flex items-start gap-3">
                                                            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-600 shrink-0">
                                                                {q.user?.name?.[0] ?? 'U'}
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="text-sm font-medium">{q.user?.name}</p>
                                                                <p className="text-sm text-gray-700 mt-1">{q.body}</p>
                                                            </div>
                                                            <button
                                                                className="text-xs text-indigo-600 hover:underline"
                                                                onClick={() => setReplyingTo(replyingTo === q.id ? null : q.id)}
                                                            >
                                                                <MessageSquare className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                        {(q.answers ?? []).map((a: any) => (
                                                            <div key={a.id} className="flex items-start gap-3 ml-6 pl-4 border-l-2 border-gray-100">
                                                                <div className="h-7 w-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-medium text-green-600 shrink-0">
                                                                    {a.user?.name?.[0] ?? 'I'}
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-medium">{a.user?.name}</p>
                                                                    <p className="text-sm text-gray-700 mt-0.5">{a.body}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {replyingTo === q.id && (
                                                            <div className="ml-6 flex gap-2">
                                                                <Textarea
                                                                    placeholder="Write an answer..."
                                                                    value={answerText[q.id] ?? ''}
                                                                    onChange={e => setAnswerText(prev => ({ ...prev, [q.id]: e.target.value }))}
                                                                    rows={2}
                                                                    className="flex-1 text-sm"
                                                                />
                                                                <Button size="sm" onClick={() => handlePostAnswer(q.id)}>
                                                                    <Send className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
