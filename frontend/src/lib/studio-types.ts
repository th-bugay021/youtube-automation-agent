export type VideoStyle = 'FACELESS' | 'ANIMATED' | 'SLIDESHOW' | 'SCREEN_RECORDING';

/**
 * Per-scene motion effect applied to still images at render time. Must stay in
 * sync with MOTION_EFFECTS in the backend studio DTO. `ken-burns` is the default.
 */
export type MotionEffect =
  | 'static'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'ken-burns';

export const DEFAULT_MOTION_EFFECT: MotionEffect = 'ken-burns';

export const MOTION_OPTIONS: { value: MotionEffect; label: string }[] = [
  { value: 'static', label: 'Static — no movement' },
  { value: 'zoom-in', label: 'Zoom in' },
  { value: 'zoom-out', label: 'Zoom out' },
  { value: 'pan-left', label: 'Pan left' },
  { value: 'pan-right', label: 'Pan right' },
  { value: 'ken-burns', label: 'Ken Burns (zoom + pan)' },
];

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
  videoUrl?: string;
  /** Per-scene motion effect applied to still images at render time. */
  motionEffect?: MotionEffect;
  /** Supabase path of a user-uploaded image; overrides the stock asset. */
  customImagePath?: string;
}

export interface VideoCreation {
  id: string;
  channelId: string;
  style: VideoStyle;
  status: CreationStatus;
  topic: string;
  niche?: string | null;
  tone?: string | null;
  format?: string | null;
  hookStyle?: string | null;
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

/**
 * Format values the channel-style analyzer emits (see backend
 * intelligence.service). Offered as a dropdown so manual overrides line up with
 * what the script generator expects. An empty value means "let the AI decide".
 */
export const FORMAT_OPTIONS = [
  'tutorial',
  'listicle',
  'story',
  'reaction',
  'analysis',
  'news',
  'mixed',
] as const;

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
