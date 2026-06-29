'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UploadCloud, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { videosApi, getApiErrorMessage } from '@/lib/api';

type Phase = 'idle' | 'uploading' | 'confirming' | 'done' | 'error';

export function VideoUpload({ courseId, onUploaded }: { courseId: string; onUploaded?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = phase === 'uploading' || phase === 'confirming';

  const reset = () => {
    setFile(null);
    setTitle('');
    setPhase('idle');
    setProgress(0);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) return;
    setError(null);
    try {
      setPhase('uploading');
      const { uploadUrl, videoId, key } = await videosApi.presign(courseId, file.type || 'video/mp4');
      await videosApi.uploadToS3(uploadUrl, file, setProgress);
      setPhase('confirming');
      await videosApi.confirm({
        videoId,
        courseId,
        title: title.trim(),
        mimeType: file.type || 'video/mp4',
        fileName: file.name,
        fileSize: file.size,
        originalKey: key,
      });
      setPhase('done');
      onUploaded?.();
    } catch (e) {
      setError(getApiErrorMessage(e, 'Upload failed. Please try again.'));
      setPhase('error');
    }
  };

  if (phase === 'done') {
    return (
      <Card className="glass border-white/10">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">
            Uploaded. Transcoding has started — the video will appear as <span className="text-foreground">Ready</span> shortly.
          </p>
          <Button variant="outline" onClick={reset}>Upload another</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass border-white/10">
      <CardHeader>
        <CardTitle className="text-lg">Upload a video</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="video-title">Title</Label>
          <Input
            id="video-title"
            value={title}
            placeholder="e.g. Introduction"
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="video-file">Video file</Label>
          <Input
            id="video-file"
            type="file"
            accept="video/*"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="text-xs text-muted-foreground">
              {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
            </p>
          ) : null}
        </div>

        {busy ? (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-lime-300 to-emerald-400 transition-[width]"
                style={{ width: `${phase === 'confirming' ? 100 : progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {phase === 'confirming' ? 'Finalizing…' : `Uploading… ${progress}%`}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button onClick={handleUpload} disabled={!file || !title.trim() || busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Upload
        </Button>
      </CardContent>
    </Card>
  );
}
