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
import { FORMAT_OPTIONS, STATUS_LABELS, VideoCreation, VideoStyle } from '@/lib/studio-types';
import { ChevronDown, Film, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Channel {
  id: string;
  title: string;
  niche?: string | null;
  defaultTone?: string | null;
  defaultFormat?: string | null;
  defaultHookStyle?: string | null;
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
    description: 'Voiceover over stock video clips — the classic AI YouTube style.',
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
  // Animated and Screen Recording are intentionally hidden until those
  // pipelines are ready — adding them back is just a matter of restoring the
  // entries here (and their icon imports).
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

  // Optional per-video style overrides. Pre-filled from the selected channel's
  // saved defaults; whatever is sent takes precedence over channel defaults and
  // auto-detection during generation. Left blank → the AI decides.
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('');
  const [format, setFormat] = useState('');
  const [hookStyle, setHookStyle] = useState('');
  const [showStyle, setShowStyle] = useState(false);

  const selectChannel = (id: string) => {
    setChannelId(id);
    const ch = (channels ?? []).find((c) => c.id === id);
    setNiche(ch?.niche ?? '');
    setTone(ch?.defaultTone ?? '');
    setFormat(ch?.defaultFormat ?? '');
    setHookStyle(ch?.defaultHookStyle ?? '');
  };

  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { channelId, style, topic, targetSeconds };
      if (niche.trim()) payload.niche = niche.trim();
      if (tone.trim()) payload.tone = tone.trim();
      if (format.trim()) payload.format = format.trim();
      if (hookStyle.trim()) payload.hookStyle = hookStyle.trim();
      return (await api.post<VideoCreation>('/studio/creations', payload)).data;
    },
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
              onChange={(e) => selectChannel(e.target.value)}
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
            <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setShowStyle((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <span className="text-sm font-medium">Style settings</span>
                <span className="ml-2 text-xs text-muted">optional — overrides channel defaults</span>
              </div>
              <ChevronDown
                className={`size-4 text-muted transition ${showStyle ? 'rotate-180' : ''}`}
              />
            </button>

            {showStyle && (
              <div className="space-y-4 border-t border-border px-4 py-4">
                <p className="text-xs text-muted">
                  Pre-filled from this channel&apos;s saved defaults. Leave a field blank to let the
                  AI infer it from the channel&apos;s existing videos.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
                      Niche
                    </label>
                    <input
                      value={niche}
                      onChange={(e) => setNiche(e.target.value)}
                      placeholder="e.g. ai-tools"
                      className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
                      Format
                    </label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
                    >
                      <option value="">Auto-detect</option>
                      {FORMAT_OPTIONS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
                      Tone
                    </label>
                    <input
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      placeholder="e.g. casual, energetic"
                      className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
                      Hook style
                    </label>
                    <input
                      value={hookStyle}
                      onChange={(e) => setHookStyle(e.target.value)}
                      placeholder="e.g. bold claim up front"
                      className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
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
