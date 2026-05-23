export type VideoStyle = 'FACELESS' | 'ANIMATED' | 'SLIDESHOW' | 'SCREEN_RECORDING';

export type CreationStatus =
  | 'DRAFT'
  | 'ANALYZING_CHANNEL'
  | 'GENERATING_SCRIPT'
  | 'SCRIPT_READY'
  | 'GENERATING_IMAGES'
  | 'IMAGES_READY'
  | 'GENERATING_AUDIO'
  | 'AUDIO_READY'
  | 'RENDERING'
  | 'RENDERED'
  | 'APPROVED'
  | 'FAILED';

export interface Scene {
  index: number;
  narration: string;
  durationSeconds: number;
  imageKeyword: string;
  imageUrl?: string;
}

export interface VideoCreation {
  id: string;
  channelId: string;
  style: VideoStyle;
  status: CreationStatus;
  topic: string;
  niche?: string | null;
  targetSeconds: number;
  channelStyle?: Record<string, unknown> | null;
  scenes?: Scene[] | null;
  audioUrl?: string | null;
  musicUrl?: string | null;
  subtitleUrl?: string | null;
  renderedUrl?: string | null;
  thumbnailUrl?: string | null;
  finalDurationSeconds?: number | null;
  videoId?: string | null;
  approvedAt?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_LABELS: Record<CreationStatus, string> = {
  DRAFT: 'Queued',
  ANALYZING_CHANNEL: 'Analyzing channel style',
  GENERATING_SCRIPT: 'Writing script',
  SCRIPT_READY: 'Script ready',
  GENERATING_IMAGES: 'Fetching images',
  IMAGES_READY: 'Images ready',
  GENERATING_AUDIO: 'Generating audio',
  AUDIO_READY: 'Audio ready',
  RENDERING: 'Rendering video',
  RENDERED: 'Render complete',
  APPROVED: 'Scheduled',
  FAILED: 'Failed',
};

export const STATUS_PROGRESS: Record<CreationStatus, number> = {
  DRAFT: 5,
  ANALYZING_CHANNEL: 12,
  GENERATING_SCRIPT: 25,
  SCRIPT_READY: 35,
  GENERATING_IMAGES: 50,
  IMAGES_READY: 60,
  GENERATING_AUDIO: 70,
  AUDIO_READY: 80,
  RENDERING: 90,
  RENDERED: 100,
  APPROVED: 100,
  FAILED: 100,
};
