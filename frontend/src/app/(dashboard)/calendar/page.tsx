'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatDate } from '@/lib/utils';

interface QueueVideo {
  id: string;
  title: string;
  status: string;
  publishAt?: string;
  channel: { id: string; title: string };
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export default function CalendarPage() {
  const { data } = useQuery<QueueVideo[]>({
    queryKey: ['queue'],
    queryFn: async () => (await api.get('/videos/queue')).data,
  });

  const week = startOfWeek(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(week);
    d.setDate(week.getDate() + i);
    return d;
  });

  const byDay: Record<string, QueueVideo[]> = {};
  for (const v of data ?? []) {
    if (!v.publishAt) continue;
    const key = new Date(v.publishAt).toDateString();
    (byDay[key] ||= []).push(v);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Content calendar</h1>
        <p className="text-sm text-muted">This week’s scheduled uploads.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d, i) => (
          <Card key={i} className="min-h-32">
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-wide text-muted">{DAYS[d.getDay()]}</CardTitle>
              <span className="text-xs text-muted">{d.getDate()}</span>
            </CardHeader>
            <div className="space-y-2">
              {(byDay[d.toDateString()] ?? []).map((v) => (
                <div key={v.id} className="rounded-lg border border-border bg-bg p-2 text-xs">
                  <div className="truncate font-medium">{v.title}</div>
                  <div className="text-muted">{v.publishAt && formatDate(v.publishAt)}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
