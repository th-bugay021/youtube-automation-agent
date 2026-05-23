'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { STATUS_LABELS, VideoCreation, VideoStyle } from '@/lib/studio-types';
import { Film, Sparkles, ImageIcon, Monitor } from 'lucide-react';
import { toast } from 'sonner';

interface Channel {
  id: string;
  title: string;
}

const STYLE_OPTIONS: {
  id: VideoStyle;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: 'full' | 'preview';
}[] = [
  {
    id: 'FACELESS',
    label: 'Faceless',
    description: 'Voiceover over stock imagery — the classic AI YouTube style.',
    icon: Film,
    status: 'full',
  },
  {
    id: 'SLIDESHOW',
    label: 'Slideshow',
    description: 'Image-per-scene cuts with subtitles and background music.',
    icon: ImageIcon,
    status: 'full',
  },
  {
    id: 'ANIMATED',
    label: 'Animated',
    description: 'Motion graphics — renders as slideshow for now.',
    icon: Sparkles,
    status: 'preview',
  },
  {
    id: 'SCREEN_RECORDING',
    label: 'Screen Recording',
    description: 'Walkthrough-style — renders as slideshow for now.',
    icon: Monitor,
    status: 'preview',
  },
];

export default function StudioIndexPage() {
  const router = useRouter();
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => (await api.get('/channels')).data,
  });
  const { data: creations } = useQuery<VideoCreation[]>({
    queryKey: ['creations'],
    queryFn: async () => (await api.get('/studio/creations')).data,
    refetchInterval: 5_000,
  });

  const [channelId, setChannelId] = useState('');
  const [style, setStyle] = useState<VideoStyle>('FACELESS');
  const [topic, setTopic] = useState('');
  const [targetSeconds, setTargetSeconds] = useState(60);

  const create = useMutation({
    mutationFn: async () =>
      (await api.post<VideoCreation>('/studio/creations', { channelId, style, topic, targetSeconds })).data,
    onSuccess: (c) => {
      toast.success('Creation started');
      router.push(`/studio/${c.id}`);
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Failed to start'),
  });

  const canStart = channelId && topic.trim().length >= 5;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Video Studio</h1>
        <p className="text-sm text-muted">
          Pick a style, give it a topic, and the studio writes the script, fetches images, records audio, and renders a slideshow video.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start a new video</CardTitle>
        </CardHeader>

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
              Channel
            </label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="h-10 w-full max-w-md rounded-lg border border-border bg-bg px-3 text-sm"
            >
              <option value="">Pick a channel…</option>
              {(channels ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
              Video style
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STYLE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = style === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStyle(opt.id)}
                    className={`relative rounded-xl border p-4 text-left transition ${
                      active ? 'border-brand bg-brand/5' : 'border-border hover:border-brand/40'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex size-9 items-center justify-center rounded-lg ${
                        active ? 'bg-brand text-white' : 'bg-border/40 text-fg'
                      }`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{opt.label}</span>
                          {opt.status === 'preview' && (
                            <Badge tone="warn" className="text-[10px]">preview</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted">{opt.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
              Topic
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. 5 productivity AI tools that actually save time"
              className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
              Target length: {targetSeconds}s
            </label>
            <input
              type="range"
              min={15}
              max={300}
              step={15}
              value={targetSeconds}
              onChange={(e) => setTargetSeconds(Number(e.target.value))}
              className="w-full max-w-md"
            />
            <div className="mt-1 flex max-w-md justify-between text-[10px] text-muted">
              <span>15s</span><span>60s</span><span>2m</span><span>5m</span>
            </div>
          </div>

          <Button disabled={!canStart} loading={create.isPending} onClick={() => create.mutate()}>
            Start generation
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent creations</CardTitle>
          <Badge>{creations?.length ?? 0}</Badge>
        </CardHeader>
        <div className="divide-y divide-border">
          {(creations ?? []).map((c) => (
            <Link
              key={c.id}
              href={`/studio/${c.id}`}
              className="flex items-center justify-between gap-3 py-3 transition hover:opacity-80"
            >
              <div className="flex items-center gap-3">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl} alt="" className="size-12 rounded-lg object-cover" />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-lg bg-border/40">
                    <Film className="size-4 text-muted" />
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium">{c.topic}</div>
                  <div className="text-xs text-muted">
                    {c.style} · {formatDate(c.createdAt)}
                  </div>
                </div>
              </div>
              <Badge
                tone={
                  c.status === 'FAILED' ? 'danger' :
                  c.status === 'RENDERED' || c.status === 'APPROVED' ? 'success' :
                  'brand'
                }
              >
                {STATUS_LABELS[c.status]}
              </Badge>
            </Link>
          ))}
          {(creations?.length ?? 0) === 0 && (
            <div className="py-6 text-center text-sm text-muted">No creations yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
