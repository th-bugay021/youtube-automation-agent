import {
  IsArray,
  IsDateString,
  IsEnum,
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
}

export class UpdateScriptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneEditDto)
  scenes!: SceneEditDto[];
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
