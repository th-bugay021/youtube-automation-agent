'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from './ui/Badge';

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  readAt: string | null;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Lightweight poll just for the badge count, runs whether or not the panel is open.
  const { data: unreadList } = useQuery<Notification[]>({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get('/notifications?unread=true')).data,
    refetchInterval: 30_000,
  });

  // Full list, only fetched while the panel is open.
  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', 'all'],
    queryFn: async () => (await api.get('/notifications')).data,
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      await api.patch('/notifications/read', { ids });
    },
    onSuccess: () => {
      // Clear the badge; leave the open panel's list as-is so the just-read
      // items stay visually highlighted until it's closed and reopened.
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });

  const unread = unreadList?.length ?? 0;

  // When the panel opens and the list arrives, mark everything unread as read.
  useEffect(() => {
    if (!open || !notifications) return;
    const ids = notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (ids.length > 0 && !markRead.isPending) {
      markRead.mutate(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, notifications]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 hover:bg-border/40"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <Badge tone="brand" className="absolute -right-1 -top-1 px-1.5 text-[10px]">
            {unread > 9 ? '9+' : unread}
          </Badge>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-medium text-fg">Notifications</span>
            {unread > 0 && <span className="text-xs text-muted">{unread} unread</span>}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="px-4 py-6 text-center text-sm text-muted">Loading…</div>
            )}
            {!isLoading && (!notifications || notifications.length === 0) && (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
                <Check className="size-5 opacity-60" />
                You&apos;re all caught up
              </div>
            )}
            {!isLoading &&
              notifications?.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    'flex flex-col gap-0.5 border-b border-border/60 px-4 py-3 last:border-0',
                    !n.readAt && 'bg-brand/5',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-fg">{n.title}</span>
                    <span className="shrink-0 text-[11px] text-muted">
                      {relativeTime(n.createdAt)}
                    </span>
                  </div>
                  {n.body && <span className="text-xs text-muted">{n.body}</span>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
