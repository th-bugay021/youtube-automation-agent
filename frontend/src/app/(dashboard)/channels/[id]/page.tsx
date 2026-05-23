'use client';

import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { toast } from 'sonner';
import { useState } from 'react';

interface Channel {
  id: string;
  title: string;
  niche?: string;
  automationMode: 'MANUAL' | 'RECOMMEND' | 'SEMI_AUTO' | 'FULL_AUTO';
  defaultPrivacy: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  approvalHoldMinutes: number;
  timezone: string;
  isActive: boolean;
}

const MODES = ['MANUAL', 'RECOMMEND', 'SEMI_AUTO', 'FULL_AUTO'] as const;

export default function ChannelDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const qc = useQueryClient();

  const { data: channel } = useQuery<Channel>({
    queryKey: ['channel', id],
    queryFn: async () => (await api.get(`/channels/${id}`)).data,
  });

  const [niche, setNiche] = useState('');

  const update = useMutation({
    mutationFn: async (patch: Partial<Channel>) => (await api.patch(`/channels/${id}`, patch)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel', id] });
      toast.success('Channel updated');
    },
    onError: () => toast.error('Update failed'),
  });

  if (!channel) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{channel.title}</h1>
        <p className="text-sm text-muted">Channel settings & automation behaviour.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automation mode</CardTitle>
          <Badge tone="brand">{channel.automationMode}</Badge>
        </CardHeader>
        <div className="grid gap-2 sm:grid-cols-4">
          {MODES.map((m) => (
            <Button
              key={m}
              variant={m === channel.automationMode ? 'primary' : 'secondary'}
              onClick={() => update.mutate({ automationMode: m })}
            >
              {m}
            </Button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          MANUAL: AI suggests, you approve every step. RECOMMEND: AI prepares drafts.
          SEMI_AUTO: AI publishes with a hold window. FULL_AUTO: AI publishes immediately.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Niche</CardTitle>
        </CardHeader>
        <div className="flex gap-2">
          <input
            value={niche || channel.niche || ''}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="e.g. ai-tools"
            className="h-10 flex-1 rounded-lg border border-border bg-bg px-3 text-sm"
          />
          <Button onClick={() => update.mutate({ niche })}>Save</Button>
        </div>
      </Card>
    </div>
  );
}
