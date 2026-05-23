'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Channel {
  id: string;
  title: string;
}

interface Idea {
  title: string;
  angle: string;
  primaryKeyword: string;
  estimatedSearchVolume: 'low' | 'medium' | 'high';
  format: string;
  thumbnailConcept: string;
}

export default function AiSuggestionsPage() {
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => (await api.get('/channels')).data,
  });

  const [channelId, setChannelId] = useState<string>('');
  const [ideas, setIdeas] = useState<Idea[]>([]);

  const generate = useMutation({
    mutationFn: async () => (await api.post(`/channels/${channelId}/ai/ideas`, { count: 5 })).data,
    onSuccess: (res: Idea[]) => {
      setIdeas(res);
      toast.success(`${res.length} ideas generated`);
    },
    onError: () => toast.error('Generation failed'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI suggestions</h1>
        <p className="text-sm text-muted">Generate ideas, titles, and full metadata bundles.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate video ideas</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap gap-3">
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="h-10 rounded-lg border border-border bg-bg px-3 text-sm"
          >
            <option value="">Pick a channel…</option>
            {(channels ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Button disabled={!channelId} onClick={() => generate.mutate()} loading={generate.isPending}>
            <Sparkles className="size-4" /> Generate
          </Button>
        </div>
      </Card>

      {ideas.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {ideas.map((i, idx) => (
            <Card key={idx}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold leading-snug">{i.title}</h3>
                <Badge tone={i.estimatedSearchVolume === 'high' ? 'success' : 'brand'}>
                  {i.estimatedSearchVolume}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted">{i.angle}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge>{i.format}</Badge>
                <Badge tone="brand">{i.primaryKeyword}</Badge>
              </div>
              <p className="mt-3 text-xs text-muted">
                <span className="font-medium">Thumbnail:</span> {i.thumbnailConcept}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
