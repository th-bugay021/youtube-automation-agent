import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AutomationMode, PrivacyStatus } from '@prisma/client';

export class UpdateChannelDto {
  @IsOptional()
  @IsEnum(AutomationMode)
  automationMode?: AutomationMode;

  @IsOptional()
  @IsEnum(PrivacyStatus)
  defaultPrivacy?: PrivacyStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  approvalHoldMinutes?: number;

  @IsOptional()
  @IsString()
  niche?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
