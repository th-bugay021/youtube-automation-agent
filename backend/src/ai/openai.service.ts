import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { OpenAiQuotaError } from '../common/filters/all-exceptions.filter';

export interface ChatCallInput {
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCallResult<T = unknown> {
  content: string;
  parsed?: T;
  tokensIn: number;
  tokensOut: number;
}

@Injectable()
export class OpenAiService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY missing');
    const baseURL = this.config.get<string>('OPENAI_BASE_URL') || undefined;
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async chat<T = unknown>(input: ChatCallInput): Promise<ChatCallResult<T>> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 1500,
        response_format: input.json ? { type: 'json_object' } : undefined,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      });

      const content = completion.choices[0]?.message?.content ?? '';
      const tokensIn = completion.usage?.prompt_tokens ?? 0;
      const tokensOut = completion.usage?.completion_tokens ?? 0;

      let parsed: T | undefined;
      if (input.json) {
        try {
          parsed = JSON.parse(content) as T;
        } catch {
          parsed = undefined;
        }
      }

      return { content, parsed, tokensIn, tokensOut };
    } catch (err: any) {
      if (err?.status === 429) throw new OpenAiQuotaError(err?.message);
      throw err;
    }
  }

  /**
   * Generates a single image from a descriptive prompt and returns the raw JPEG
   * bytes. Used by the studio pipeline to render scene visuals from a detailed,
   * narration-derived prompt instead of stock-photo search.
   *
   * Defaults to `gpt-image-1` at 1536x1024 (landscape, fits the 16:9 video
   * timeline well enough for Shotstack to crop). The model returns base64 by
   * default. Model and size are env-overridable.
   */
  async generateImage(prompt: string): Promise<Buffer> {
    const model = this.config.get<string>('OPENAI_IMAGE_MODEL') ?? 'gpt-image-1';
    const size = (this.config.get<string>('OPENAI_IMAGE_SIZE') ?? '1536x1024') as any;
    try {
      const result = await this.client.images.generate({
        model,
        // gpt-image-1 accepts up to 32k prompt chars; clamp defensively.
        prompt: prompt.slice(0, 4000),
        size,
        n: 1,
        // JPEG keeps files small for storage + Shotstack fetch. gpt-image-1 only.
        output_format: 'jpeg',
      } as any);
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error('Image generation returned no data');
      return Buffer.from(b64, 'base64');
    } catch (err: any) {
      if (err?.status === 429) throw new OpenAiQuotaError(err?.message);
      throw err;
    }
  }
}
