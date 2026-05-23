'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatNumber } from '@/lib/utils';
import { Activity, AlertTriangle, Calendar, Users } from 'lucide-react';

interface DashboardSummary {
  channels: { id: string; title: string; subscriberCount: number; videoCount: number; viewCount: number }[];
  totals: { subscribers: number; videos: number; views: number };
  upcomingScheduled: number;
  failedLast7: number;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/analytics/dashboard')).data,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted">Performance across all linked channels.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Subscribers" value={formatNumber(data?.totals.subscribers ?? 0)} loading={isLoading} />
        <Stat icon={Activity} label="Total views" value={formatNumber(data?.totals.views ?? 0)} loading={isLoading} />
        <Stat icon={Calendar} label="Scheduled" value={String(data?.upcomingScheduled ?? 0)} loading={isLoading} />
        <Stat icon={AlertTriangle} label="Failed (7d)" value={String(data?.failedLast7 ?? 0)} tone={data?.failedLast7 ? 'danger' : 'neutral'} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <Badge tone="brand">{data?.channels.length ?? 0}</Badge>
        </CardHeader>
        <div className="divide-y divide-border">
          {(data?.channels ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-sm font-medium">{c.title}</div>
                <div className="text-xs text-muted">{formatNumber(c.subscriberCount)} subscribers</div>
              </div>
              <div className="text-xs text-muted">{c.videoCount} videos</div>
            </div>
          ))}
          {!isLoading && (data?.channels.length ?? 0) === 0 && (
            <div className="py-6 text-center text-sm text-muted">
              No channels linked yet. Connect a YouTube account from settings.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = 'brand',
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: 'brand' | 'danger' | 'neutral';
  loading?: boolean;
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-danger/15 text-danger'
      : tone === 'neutral'
      ? 'bg-border/40 text-fg'
      : 'bg-brand/15 text-brand';
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">{label}</div>
          <div className="mt-1 text-2xl font-semibold">{loading ? '—' : value}</div>
        </div>
        <div className={`flex size-10 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}
