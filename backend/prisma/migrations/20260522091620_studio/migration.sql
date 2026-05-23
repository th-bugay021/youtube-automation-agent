-- CreateEnum
CREATE TYPE "VideoStyle" AS ENUM ('FACELESS', 'ANIMATED', 'SLIDESHOW', 'SCREEN_RECORDING');

-- CreateEnum
CREATE TYPE "CreationStatus" AS ENUM ('DRAFT', 'ANALYZING_CHANNEL', 'GENERATING_SCRIPT', 'SCRIPT_READY', 'GENERATING_IMAGES', 'IMAGES_READY', 'GENERATING_AUDIO', 'AUDIO_READY', 'RENDERING', 'RENDERED', 'APPROVED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_RENDER_READY';
ALTER TYPE "NotificationType" ADD VALUE 'STUDIO_RENDER_FAILED';

-- CreateTable
CREATE TABLE "VideoCreation" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "style" "VideoStyle" NOT NULL DEFAULT 'SLIDESHOW',
    "status" "CreationStatus" NOT NULL DEFAULT 'DRAFT',
    "topic" TEXT NOT NULL,
    "niche" TEXT,
    "targetSeconds" INTEGER NOT NULL DEFAULT 60,
    "channelStyle" JSONB,
    "scenes" JSONB,
    "audioUrl" TEXT,
    "musicUrl" TEXT,
    "subtitleUrl" TEXT,
    "renderedUrl" TEXT,
    "thumbnailUrl" TEXT,
    "finalDurationSeconds" DOUBLE PRECISION,
    "videoId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoCreation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VideoCreation_videoId_key" ON "VideoCreation"("videoId");

-- CreateIndex
CREATE INDEX "VideoCreation_channelId_status_idx" ON "VideoCreation"("channelId", "status");

-- AddForeignKey
ALTER TABLE "VideoCreation" ADD CONSTRAINT "VideoCreation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCreation" ADD CONSTRAINT "VideoCreation_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;
