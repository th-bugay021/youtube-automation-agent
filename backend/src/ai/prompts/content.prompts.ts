export const IDEA_SYSTEM = `You are an expert YouTube strategist. Generate high-CTR video ideas
for a creator's niche. You write only valid JSON.`;

export const ideaUserPrompt = (niche: string, count: number, recentTitles: string[]): string => `
Niche: ${niche}
Recent titles on this channel (avoid duplicates): ${JSON.stringify(recentTitles)}
Return JSON of shape:
{
  "ideas": [
    {
      "title": "string under 60 chars",
      "angle": "one-sentence hook angle",
      "primaryKeyword": "string",
      "estimatedSearchVolume": "low|medium|high",
      "format": "tutorial|comparison|opinion|challenge|build-along|listicle",
      "thumbnailConcept": "string"
    }
  ]
}
Generate exactly ${count} ideas. They must be distinct from each other and from recent titles.`;

export const METADATA_SYSTEM = `You are an SEO-driven YouTube editor. You write only valid JSON.`;

export const metadataUserPrompt = (
  topic: string,
  niche: string,
  channelStyle?: string,
): string => `
Generate publishing metadata for a new YouTube video.
Topic: ${topic}
Niche: ${niche}
${channelStyle ? `Channel voice: ${channelStyle}` : ''}

Return JSON of shape:
{
  "title": "string under 60 chars, no clickbait",
  "description": "string 200-400 words, plain text, no markdown, first 2 lines hook viewer",
  "tags": ["10-15 tags ordered by importance"],
  "hashtags": ["3 hashtags including # symbol"],
  "categoryId": "YouTube category id as string, default 22",
  "thumbnailPrompt": "image generation prompt for a high-CTR thumbnail"
}`;

export const TREND_SYSTEM = `You analyse YouTube niches and surface viral angles. Output JSON only.`;

export const trendUserPrompt = (niche: string, region = 'US'): string => `
Niche: ${niche}
Region: ${region}
Return JSON: { "trends": [ { "topic": "...", "why": "one sentence", "urgency": "low|medium|high" } ] }
Give 5 trends.`;
