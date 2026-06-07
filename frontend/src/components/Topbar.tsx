'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { LogOut } from 'lucide-react';
import { ThemeToggle } from './ui/ThemeToggle';
import { NotificationsPanel } from './NotificationsPanel';

interface Me {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export function Topbar() {
  const { data: me } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/users/me')).data,
  });

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/60 px-5 backdrop-blur">
      <div className="text-sm text-muted">Welcome back{me?.name ? `, ${me.name}` : ''}</div>
      <div className="flex items-center gap-2">
        <NotificationsPanel />
        <ThemeToggle />
        <button
          onClick={async () => {
            await api.post('/auth/logout').catch(() => undefined);
            window.location.href = '/login';
          }}
          className="rounded-lg p-2 hover:bg-border/40"
          aria-label="Log out"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </header>
  );
}
