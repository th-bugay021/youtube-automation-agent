'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Tv2,
  Video,
  Clock,
  CalendarDays,
  Sparkles,
  BarChart3,
  Settings,
  Film,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/channels', label: 'Channels', icon: Tv2 },
  { href: '/videos', label: 'Videos', icon: Video },
  { href: '/studio', label: 'AI Studio', icon: Film },
  { href: '/queue', label: 'Upload Queue', icon: Clock },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/ai', label: 'AI Suggestions', icon: Sparkles },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden h-screen w-60 shrink-0 border-r border-border bg-card px-3 py-5 md:flex md:flex-col">
      <Link href="/dashboard" className="mb-6 px-2">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-brand" />
          <span className="text-sm font-semibold">YouTube Auto</span>
        </div>
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((it) => {
          const active = pathname?.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                active ? 'bg-brand/10 text-brand' : 'text-fg hover:bg-border/40',
              )}
            >
              <Icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
