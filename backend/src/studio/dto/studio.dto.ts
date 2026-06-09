import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VideoStyle } from '@prisma/client';

/**
 * Per-scene motion (Ken Burns-style) effect applied to still images at render
 * time. `ken-burns` is the default for every scene. See RendererService for the
 * Shotstack transforms each value maps to.
 */
export const MOTION_EFFECTS = [
  'static',
  'zoom-in',
  'zoom-out',
  'pan-left',
  'pan-right',
  'ken-burns',
] as const;

export type MotionEffect = (typeof MOTION_EFFECTS)[number];

export class CreateCreationDto {
  @IsString()
  channelId!: string;

  @IsEnum(VideoStyle)
  style!: VideoStyle;

  @IsString()
  @MaxLength(200)
  topic!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  niche?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  format?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  hookStyle?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  topThemes?: string[];

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(600)
  targetSeconds?: number;
}

export class SceneEditDto {
  @IsInt()
  @Min(0)
  index!: number;

  @IsString()
  @MaxLength(800)
  narration!: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(15)
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  imageKeyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  imagePrompt?: string;

  @IsOptional()
  @IsIn(MOTION_EFFECTS)
  motionEffect?: MotionEffect;
}

export class UpdateScriptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneEditDto)
  scenes!: SceneEditDto[];
}

/**
 * Manually override (or clear) the auto-detected recurring themes for a
 * creation. An empty array clears the override so generation falls back to the
 * niche / auto-detected themes.
 */
export class UpdateTopThemesDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  topThemes!: string[];
}

export class RefreshSceneAssetDto {
  // The (possibly user-edited) keyword to fetch a new stock clip with (faceless).
  // Optional: when omitted, the scene's existing keyword is reused.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  imageKeyword?: string;

  // The (possibly user-edited) image-generation prompt for still-image styles.
  // Optional: when omitted, the scene's existing prompt is reused.
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  imagePrompt?: string;
}

export class ApproveCreationDto {
  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @IsString()
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  privacyStatus?: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
}
