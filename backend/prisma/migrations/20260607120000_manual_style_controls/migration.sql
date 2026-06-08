-- AlterTable: per-video manual style overrides
ALTER TABLE "VideoCreation" ADD COLUMN     "tone" TEXT,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "hookStyle" TEXT;

-- AlterTable: saved channel default style preferences
ALTER TABLE "Channel" ADD COLUMN     "defaultTone" TEXT,
ADD COLUMN     "defaultFormat" TEXT,
ADD COLUMN     "defaultHookStyle" TEXT;
