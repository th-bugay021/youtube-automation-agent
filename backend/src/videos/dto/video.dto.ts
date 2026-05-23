import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PrivacyStatus } from '@prisma/client';

export class CreateVideoDto {
  @IsString()
  channelId!: string;

  @IsString()
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsEnum(PrivacyStatus)
  privacyStatus?: PrivacyStatus;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  playlistId?: string;

  @IsOptional()
  @IsString()
  videoFilePath?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsDateString()
  publishAt?: string;

  @IsOptional()
  @IsBoolean()
  aiGenerated?: boolean;
}

export class UpdateVideoDto {
  @IsOptional() @IsString() @MaxLength(100) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) hashtags?: string[];
  @IsOptional() @IsEnum(PrivacyStatus) privacyStatus?: PrivacyStatus;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() playlistId?: string;
  @IsOptional() @IsString() thumbnailUrl?: string;
  @IsOptional() @IsDateString() publishAt?: string;
}

export class ApproveVideoDto {
  @IsOptional() @IsDateString() publishAt?: string;
}
