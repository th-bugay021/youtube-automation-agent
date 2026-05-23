'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatNumber } from '@/lib/utils';
import Link from 'next/link';

interface Channel {
  id: string;
  title: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  videoCount: number;
  automationMode: string;
  isActive: boolean;
  niche?: string;
}

export default function ChannelsPage() {
  const { data } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => (await api.get('/channels')).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Channels</h1>
        <p className="text-sm text-muted">Manage your connected YouTube channels.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((c) => (
          <Link key={c.id} href={`/channels/${c.id}`}>
            <Card className="cursor-pointer transition hover:border-brand/50">
              <div className="flex items-center gap-3">
                {c.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl} alt="" className="size-12 rounded-full object-cover" />
                ) : (
                  <div className="size-12 rounded-full bg-border/50" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{c.title}</div>
                  <div className="text-xs text-muted">{formatNumber(c.subscriberCount)} subs · {c.videoCount} videos</div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Active' : 'Disconnected'}</Badge>
                <Badge tone="brand">{c.automationMode}</Badge>
              </div>
            </Card>
          </Link>
        ))}
        {(data?.length ?? 0) === 0 && (
          <Card>
            <p className="text-sm text-muted">No channels yet. Visit Settings to link a YouTube account.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
