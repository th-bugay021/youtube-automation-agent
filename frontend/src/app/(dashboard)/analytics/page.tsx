'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useState } from 'react';

interface Channel {
  id: string;
  title: string;
}

interface Snapshot {
  capturedAt: string;
  views: number;
  ctr: number;
  averageViewPct: number;
}

export default function AnalyticsPage() {
  const { data: channels } = useQuery<Channel[]>({
    queryKey: ['channels'],
    queryFn: async () => (await api.get('/channels')).data,
  });

  const [channelId, setChannelId] = useState('');

  const { data: series } = useQuery<Snapshot[]>({
    queryKey: ['analytics', channelId],
    queryFn: async () => (await api.get(`/analytics/channel/${channelId}`)).data,
    enabled: Boolean(channelId),
  });

  const chartData = (series ?? []).map((s) => ({
    date: new Date(s.capturedAt).toLocaleDateString(),
    views: s.views,
    ctr: s.ctr,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted">Engagement signals used by the scheduling engine.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pick a channel</CardTitle>
        </CardHeader>
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="h-10 w-full max-w-sm rounded-lg border border-border bg-bg px-3 text-sm"
        >
          <option value="">Choose…</option>
          {(channels ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </Card>

      {channelId && (
        <Card>
          <CardHeader>
            <CardTitle>Views (last 30 days)</CardTitle>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgb(var(--brand))" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="rgb(var(--brand))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgb(var(--border))" />
                <XAxis dataKey="date" stroke="rgb(var(--muted))" />
                <YAxis stroke="rgb(var(--muted))" />
                <Tooltip
                  contentStyle={{
                    background: 'rgb(var(--card))',
                    border: '1px solid rgb(var(--border))',
                  }}
                />
                <Area dataKey="views" stroke="rgb(var(--brand))" fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
