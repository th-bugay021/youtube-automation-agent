import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'success' | 'warn' | 'danger' | 'brand';

const tones: Record<Tone, string> = {
  neutral: 'bg-border/40 text-fg',
  success: 'bg-success/15 text-success',
  warn: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400',
  danger: 'bg-danger/15 text-danger',
  brand: 'bg-brand/15 text-brand',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
