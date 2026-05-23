'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StageProgress } from '@/components/studio/StageProgress';
import { VideoCreation, Scene, STATUS_LABELS } from '@/lib/studio-types';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle2, ChevronLeft } from 'lucide-react';

export default function StudioWizardPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();

  const { data: creation } = useQuery<VideoCreation>({
    queryKey: ['creation', id],
    queryFn: async () => (await api.get(`/studio/creations/${id}`)).data,
    refetchInterval: (q) => {
      const status = (q.state.data as VideoCreation | undefined)?.status;
      if (!status || status === 'RENDERED' || status === 'APPROVED' || status === 'FAILED') return false;
      return 3_000;
    },
  });

  const [scenes, setScenes] = useState<Scene[] | null>(null);
  useEffect(() => {
    if (creation?.scenes && !scenes) setScenes(creation.scenes);
  }, [creation, scenes]);

  const isReadyToApprove = creation?.status === 'RENDERED';
  const canEditScript = creation && ['SCRIPT_READY', 'IMAGES_READY', 'AUDIO_READY', 'RENDERED'].includes(creation.status);

  const saveScript = useMutation({
    mutationFn: async () => (await api.post(`/studio/creations/${id}/script`, { scenes: scenes ?? [] })).data,
    onSuccess: () => {
      toast.success('Script saved');
      qc.invalidateQueries({ queryKey: ['creation', id] });
    },
  });

  const regenerate = useMutation({
    mutationFn: async () => (await api.post(`/studio/creations/${id}/regenerate`)).data,
    onSuccess: () => {
      toast.success('Regenerating');
      qc.invalidateQueries({ queryKey: ['creation', id] });
    },
  });

  if (!creation) {
    return <div className="text-sm text-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => router.push('/studio')}
          className="mb-2 flex items-center gap-1 text-xs text-muted hover:text-fg"
        >
          <ChevronLeft className="size-3" /> Back to studio
        </button>
        <h1 className="text-2xl font-semibold">{creation.topic}</h1>
        <p className="text-sm text-muted">
          {creation.style} · {creation.targetSeconds}s · created {formatDate(creation.createdAt)}
        </p>
      </div>

      <Card>
        <StageProgress status={creation.status} failureReason={creation.failureReason} />
      </Card>

      {creation.channelStyle && (
        <Card>
          <CardHeader>
            <CardTitle>Channel style analysis</CardTitle>
            <Badge tone="brand">Auto-detected</Badge>
          </CardHeader>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {Object.entries(creation.channelStyle as Record<string, unknown>).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
                <dd className="mt-0.5">{Array.isArray(v) ? v.join(', ') : String(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {scenes && (
        <Card>
          <CardHeader>
            <CardTitle>Script ({scenes.length} scenes)</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => saveScript.mutate()}
                disabled={!canEditScript || saveScript.isPending}
                loading={saveScript.isPending}
              >
                Save edits
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => regenerate.mutate()}
                loading={regenerate.isPending}
              >
                <RefreshCw className="size-3" /> Re-render
              </Button>
            </div>
          </CardHeader>
          <div className="space-y-4">
            {scenes.map((scene, idx) => (
              <div key={scene.index} className="grid gap-3 rounded-lg border border-border bg-bg/40 p-3 sm:grid-cols-[160px_1fr]">
                <div>
                  {scene.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={scene.imageUrl}
                      alt={scene.imageKeyword}
                      className="aspect-video w-full rounded object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded bg-border/40 text-xs text-muted">
                      {scene.imageKeyword}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                    <span>Scene {idx + 1}</span>
                    <span>{scene.durationSeconds}s</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <textarea
                    value={scene.narration}
                    onChange={(e) => {
                      const next = [...scenes];
                      next[idx] = { ...scene, narration: e.target.value };
                      setScenes(next);
                    }}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed"
                    disabled={!canEditScript}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      value={scene.imageKeyword}
                      onChange={(e) => {
                        const next = [...scenes];
                        next[idx] = { ...scene, imageKeyword: e.target.value };
                        setScenes(next);
                      }}
                      className="h-8 flex-1 rounded border border-border bg-bg px-2 text-xs"
                      placeholder="Image keyword"
                      disabled={!canEditScript}
                    />
                    <input
                      type="number"
                      value={scene.durationSeconds}
                      min={2}
                      max={15}
                      onChange={(e) => {
                        const next = [...scenes];
                        next[idx] = { ...scene, durationSeconds: Number(e.target.value) };
                        setScenes(next);
                      }}
                      className="h-8 w-16 rounded border border-border bg-bg px-2 text-xs"
                      disabled={!canEditScript}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {creation.renderedUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            {creation.finalDurationSeconds && (
              <Badge>{Math.round(creation.finalDurationSeconds)}s</Badge>
            )}
          </CardHeader>
          <video
            src={creation.renderedUrl}
            poster={creation.thumbnailUrl ?? undefined}
            controls
            className="w-full max-w-3xl rounded-xl border border-border"
          />
        </Card>
      )}

      {isReadyToApprove && <ApprovalPanel creation={creation} />}
    </div>
  );
}

function ApprovalPanel({ creation }: { creation: VideoCreation }) {
  const router = useRouter();
  const [title, setTitle] = useState(creation.topic);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacyStatus, setPrivacyStatus] = useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>('PRIVATE');

  const { data: bestTime } = useQuery<{
    dayOfWeek: number;
    hour: number;
    rationale: string;
    confidence: string;
    publishAt: string;
  }>({
    queryKey: ['creation-best-time', creation.id],
    queryFn: async () => (await api.get(`/studio/creations/${creation.id}/best-time`)).data,
  });

  const [publishAt, setPublishAt] = useState('');
  useEffect(() => {
    if (bestTime && !publishAt) setPublishAt(bestTime.publishAt.slice(0, 16));
  }, [bestTime, publishAt]);

  const approve = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/studio/creations/${creation.id}/approve`, {
          title,
          description,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          privacyStatus,
          publishAt: publishAt ? new Date(publishAt).toISOString() : undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success('Scheduled — heading to upload queue');
      router.push('/queue');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error?.message ?? 'Approval failed'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approve &amp; schedule</CardTitle>
        <Badge tone="success">Ready</Badge>
      </CardHeader>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">YouTube title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Privacy</label>
            <select
              value={privacyStatus}
              onChange={(e) => setPrivacyStatus(e.target.value as any)}
              className="h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm"
            >
              <option value="PRIVATE">Private</option>
              <option value="UNLISTED">Unlisted</option>
              <option value="PUBLIC">Public</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Publish at</label>
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            className="h-10 w-full max-w-sm rounded-lg border border-border bg-bg px-3 text-sm"
          />
          {bestTime && (
            <p className="mt-1 text-xs text-muted">
              Suggested: {new Date(bestTime.publishAt).toLocaleString()} · {bestTime.rationale} ({bestTime.confidence} confidence)
            </p>
          )}
        </div>
        <Button onClick={() => approve.mutate()} loading={approve.isPending}>
          <CheckCircle2 className="size-4" /> Approve &amp; schedule upload
        </Button>
      </div>
    </Card>
  );
}
