-- AlterTable: per-video manual override for auto-detected recurring themes.
-- Empty array means "fall back to the niche / auto-detected themes".
ALTER TABLE "VideoCreation" ADD COLUMN     "topThemes" TEXT[] DEFAULT ARRAY[]::TEXT[];
