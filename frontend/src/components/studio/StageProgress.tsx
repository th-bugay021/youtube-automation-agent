import { cn } from '@/lib/utils';
import { STATUS_LABELS, STATUS_PROGRESS, CreationStatus } from '@/lib/studio-types';

const STAGES: { label: string; statuses: CreationStatus[] }[] = [
  { label: 'Setup', statuses: ['DRAFT', 'ANALYZING_CHANNEL'] },
  { label: 'Script', statuses: ['GENERATING_SCRIPT', 'SCRIPT_READY'] },
  { label: 'Images', statuses: ['GENERATING_IMAGES', 'IMAGES_READY'] },
  { label: 'Audio', statuses: ['GENERATING_AUDIO', 'AUDIO_READY'] },
  { label: 'Render', statuses: ['RENDERING', 'RENDERED'] },
  { label: 'Approve', statuses: ['APPROVED'] },
];

export function StageProgress({
  status,
  failureReason,
}: {
  status: CreationStatus;
  failureReason?: string | null;
}) {
  const progress = STATUS_PROGRESS[status] ?? 0;
  const failed = status === 'FAILED';
  let activeIdx = STAGES.findIndex((s) => s.statuses.includes(status));
  if (activeIdx === -1) activeIdx = 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{STATUS_LABELS[status]}</span>
        <span>{progress}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className={cn(
            'h-full transition-all duration-500',
            failed ? 'bg-danger' : 'bg-brand',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="grid grid-cols-6 gap-1 text-[10px]">
        {STAGES.map((stage, i) => (
          <div
            key={stage.label}
            className={cn(
              'flex flex-col items-center gap-1 rounded p-1.5 text-center transition-colors',
              i < activeIdx && !failed && 'text-success',
              i === activeIdx && !failed && 'text-brand',
              failed && i === activeIdx && 'text-danger',
              i > activeIdx && 'text-muted',
            )}
          >
            <div
              className={cn(
                'size-1.5 rounded-full',
                i < activeIdx && !failed && 'bg-success',
                i === activeIdx && !failed && 'bg-brand animate-pulse',
                failed && i === activeIdx && 'bg-danger',
                i > activeIdx && 'bg-border',
              )}
            />
            {stage.label}
          </div>
        ))}
      </div>
      {failed && failureReason && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {failureReason}
        </p>
      )}
    </div>
  );
}
