import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAI } from 'openai';
import { FinancialData } from '../dto/financial-data.dto';
import { LLMAnalysisRequest, LLMAnalysisResponse } from '../dto/llm-analysis.dto';

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly client: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const providedBaseURL = this.configService.get<string>('OPENAI_BASE_URL');
    const baseURL = this.normalizeBaseURL(providedBaseURL);
    this.client = new OpenAI({ apiKey, baseURL });
  }

  private normalizeBaseURL(baseURL: string | undefined): string | undefined {
    if (!baseURL) {
      return undefined;
    }

    const normalized = baseURL.trim();

    if (normalized.startsWith('https://openrouter.ai/v1')) {
      return normalized.replace('https://openrouter.ai/v1', 'https://openrouter.ai/api/v1');
    }

    return normalized;
  }

  /**
   * Build a model request to analyze financials and parse the JSON analysis response.
   * Returns an `LLMAnalysisResponse` after normalization and validation.
   */
  async analyzeFinancials(
    payload: LLMAnalysisRequest,
  ): Promise<LLMAnalysisResponse> {
    const model =
      this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-3.5-turbo';
    this.logger.log(`Requesting OpenAI analysis for ${payload.ticker} using ${model}`);

    const completion = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a financial analysis assistant. Return only valid JSON using the schema exactly and do not include any commentary outside the JSON object.',
        },
        {
          role: 'user',
          content: this.buildPrompt(payload),
        },
      ],
      temperature: 0.2,
    });

    const rawContent = completion.choices?.[0]?.message?.content ?? '';
    // Raw model output logging removed for production cleanliness.

    const jsonText = this.extractJson(rawContent);
    const analysis = this.parseJson(jsonText, rawContent);

    const normalized = this.normalizeAnalysis(analysis);

    if (!this.isValidAnalysisResponse(normalized)) {
      this.logger.error('Normalized analysis failed validation', JSON.stringify(normalized).slice(0, 1000));
      throw new Error('OpenAI returned invalid analysis JSON');
    }

    return normalized;
  }

  /**
   * Build the assistant prompt text that includes the financials and headlines.
   */
  private buildPrompt(payload: LLMAnalysisRequest): string {
    return [`Analyze the stock ${payload.ticker} using the data below.`,
      'Return a single JSON object with these fields:',
      '- ticker',
      '- companyName',
      '- summary',
      '- recommendation',
      '- confidence',
      '- reasoning',
      '- riskFactors',
      '- source',
      '',
      'Financials:',
      JSON.stringify(payload.financials, null, 2),
      '',
      'Headlines:',
      payload.headlines.map((headline) => `- ${headline}`).join('\n'),
      '',
      'Output valid JSON only. Avoid any extra text or markdown formatting.',
    ].join('\n');
  }

  /**
   * Extract a single JSON object from model output.
   * Handles fenced code blocks, plain JSON blocks, and attempts a balanced-brace scan.
   * Throws if a JSON object cannot be located.
   */
  private extractJson(text: string): string {
    const cleaned = text || '';

    // 1) Look for fenced code block with json
    const fencedJsonMatch = cleaned.match(/```\s*json\s*([\s\S]*?)```/i);
    if (fencedJsonMatch && fencedJsonMatch[1]) {
      return fencedJsonMatch[1].trim();
    }

    // 2) Look for any fenced block (```...```) and try its contents
    const fencedAnyMatch = cleaned.match(/```([\s\S]*?)```/m);
    if (fencedAnyMatch && fencedAnyMatch[1]) {
      const candidate = fencedAnyMatch[1].trim();
      if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate;
    }

    // 3) Fallback: find a balanced JSON object by scanning braces (handles nested braces and strings)
    const start = cleaned.indexOf('{');
    if (start === -1) {
      throw new Error('OpenAI response did not contain JSON');
    }

    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return cleaned.slice(start, i + 1);
        }
      }
    }

    throw new Error('OpenAI response did not contain a complete JSON object');
  }

  /**
   * Parse JSON text and wrap parse errors with a consistent message.
   * We avoid logging large raw responses here for production cleanliness.
   */
  private parseJson(text: string, raw?: string): unknown {
    try {
      return JSON.parse(text);
    } catch (error) {
      this.logger.error('Failed to parse JSON from model response');
      throw new Error(`Failed to parse model JSON response: ${(error as Error).message}`);
    }
  }


  private isValidAnalysisResponse(value: unknown): value is LLMAnalysisResponse {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Partial<LLMAnalysisResponse>;

    if (typeof v.ticker !== 'string') return false;
    if (typeof v.companyName !== 'string') return false;
    if (typeof v.summary !== 'string') return false;
    if (typeof v.recommendation !== 'string') return false;

    if (!(typeof v.confidence === 'number' || v.confidence === null)) return false;

    if (typeof v.reasoning !== 'string') return false;

    if (!Array.isArray(v.riskFactors)) return false;
    if (!v.riskFactors.every((item) => typeof item === 'string')) return false;

    if (typeof v.source !== 'string') return false;

    return true;
  }

  private normalizeAnalysis(value: unknown): LLMAnalysisResponse {
    const v = value as any;

    const missing = (k: string) => new Error(`Analysis missing or invalid field: ${k}`);

    if (typeof v !== 'object' || v === null) throw missing('root');

    const ticker = typeof v.ticker === 'string' ? v.ticker : (() => { throw missing('ticker'); })();
    const companyName = typeof v.companyName === 'string' ? v.companyName : (() => { throw missing('companyName'); })();
    const summary = typeof v.summary === 'string' ? v.summary : (() => { throw missing('summary'); })();
    const recommendation = typeof v.recommendation === 'string' ? v.recommendation : (() => { throw missing('recommendation'); })();
    const reasoning = typeof v.reasoning === 'string' ? v.reasoning : (() => { throw missing('reasoning'); })();
    const source = typeof v.source === 'string' ? v.source : (() => { throw missing('source'); })();

    let riskFactors: string[];
    if (Array.isArray(v.riskFactors)) {
      riskFactors = v.riskFactors.map((r: unknown) => (typeof r === 'string' ? r : String(r)));
    } else if (typeof v.riskFactors === 'string') {
      // split by newlines or commas
      riskFactors = v.riskFactors
        .split(/\r?\n|,|;/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
      if (riskFactors.length === 0) throw missing('riskFactors');
    } else {
      throw missing('riskFactors');
    }

    // Normalize confidence: allow number, null, or descriptive strings
    let confidence: number | null = null;
    if (v.confidence === null || v.confidence === undefined) {
      confidence = null;
    } else if (typeof v.confidence === 'number') {
      confidence = v.confidence;
    } else if (typeof v.confidence === 'string') {
      const s = v.confidence.toLowerCase().trim();
      if (s === 'high') confidence = 0.9;
      else if (s === 'medium' || s === 'moderate') confidence = 0.6;
      else if (s === 'low') confidence = 0.3;
      else if (!isNaN(Number(s))) confidence = Number(s);
      else {
        this.logger.warn(`Unrecognized confidence string from model: "${v.confidence}" — setting to null`);
        confidence = null;
      }
    } else {
      this.logger.warn(`Unhandled confidence type: ${typeof v.confidence} — setting to null`);
      confidence = null;
    }

    return {
      ticker,
      companyName,
      summary,
      recommendation,
      confidence,
      reasoning,
      riskFactors,
      source,
    };
  }
}
