'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HlsPlayer } from '@/lib/player';

const TRANSCODER_URL = process.env.NEXT_PUBLIC_TRANSCODER_URL || 'http://localhost:7070';
const MASTER_PLAYLIST_URL = `${TRANSCODER_URL}/api/video-transcoder/hls/master.m3u8`;

export default function VideoTranscoderPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Video Transcoder (HLS)</h1>
          <Link href="/">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>HLS playback with quality switching</CardTitle>
            <CardDescription>
              Master playlist (API with CORS): {MASTER_PLAYLIST_URL}
              <br />
              Run <code className="text-xs bg-muted px-1 rounded">node src/utils/transcode.js</code> in
              video-transcoder to generate constants/out/hls/ if the video does not load.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HlsPlayer src={MASTER_PLAYLIST_URL} showQualitySelector />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
