'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

interface QueueVideo {
  id: string;
  title: string;
  status: string;
  publishAt?: string;
  failureReason?: string | null;
  channel: { id: string; title: string; thumbnailUrl?: string };
}

const STATUS_TONE: Record<string, 'brand' | 'success' | 'warn' | 'danger' | 'neutral'> = {
  SCHEDULED: 'brand',
  PENDING_APPROVAL: 'warn',
  AI_GENERATED: 'neutral',
  UPLOADING: 'brand',
  FAILED: 'danger',
};

export default function QueuePage() {
  const qc = useQueryClient();
  const { data } = useQuery<QueueVideo[]>({
    queryKey: ['queue'],
    queryFn: async () => (await api.get('/videos/queue')).data,
    refetchInterval: 10_000,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => (await api.post(`/videos/${id}/approve`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      toast.success('Approved and scheduled');
    },
    onError: () => toast.error('Approve failed'),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/videos/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      toast.success('Cancelled');
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload queue</h1>
        <p className="text-sm text-muted">Videos waiting for approval, upload, or showing failures.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          <Badge>{data?.length ?? 0} item(s)</Badge>
        </CardHeader>
        <div className="divide-y divide-border">
          {(data ?? []).map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{v.title}</div>
                <div className="text-xs text-muted">
                  {v.channel.title} · {v.publishAt ? formatDate(v.publishAt) : 'No schedule'}
                </div>
                {v.failureReason && <div className="mt-1 text-xs text-danger">{v.failureReason}</div>}
              </div>
              <Badge tone={STATUS_TONE[v.status] ?? 'neutral'}>{v.status}</Badge>
              <div className="flex gap-2">
                {(v.status === 'AI_GENERATED' || v.status === 'PENDING_APPROVAL') && (
                  <Button size="sm" onClick={() => approve.mutate(v.id)} loading={approve.isPending}>
                    Approve
                  </Button>
                )}
                {v.status !== 'UPLOADING' && (
                  <Button size="sm" variant="secondary" onClick={() => cancel.mutate(v.id)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ))}
          {(data?.length ?? 0) === 0 && (
            <div className="py-6 text-center text-sm text-muted">Nothing in the queue right now.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
