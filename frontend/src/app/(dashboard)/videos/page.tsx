'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { useState } from 'react';

interface Channel { id: string; title: string }
interface Video {
  id: string;
  title: string;
  status: string;
  publishAt?: string;
  publishedAt?: string;
  youtubeVideoId?: string;
}

export default function VideosPage() {
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => (await api.get('/channels')).data,
  });

  const [channelId, setChannelId] = useState('');

  const { data: videos } = useQuery<Video[]>({
    queryKey: ['videos', channelId],
    queryFn: async () => (await api.get(`/videos/by-channel/${channelId}`)).data,
    enabled: Boolean(channelId),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Videos</h1>
        <p className="text-sm text-muted">All videos across a channel’s lifecycle.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channel</CardTitle>
        </CardHeader>
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="h-10 w-full max-w-sm rounded-lg border border-border bg-bg px-3 text-sm"
        >
          <option value="">Choose…</option>
          {(channels ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </Card>

      {channelId && (
        <Card>
          <CardHeader>
            <CardTitle>{videos?.length ?? 0} videos</CardTitle>
          </CardHeader>
          <div className="divide-y divide-border">
            {(videos ?? []).map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{v.title}</div>
                  <div className="text-xs text-muted">
                    {v.publishedAt
                      ? `Published ${formatDate(v.publishedAt)}`
                      : v.publishAt
                      ? `Scheduled ${formatDate(v.publishAt)}`
                      : 'Draft'}
                  </div>
                </div>
                <Badge tone={v.status === 'PUBLISHED' ? 'success' : v.status === 'FAILED' ? 'danger' : 'brand'}>
                  {v.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
