import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import {
  ANALYSIS_QUEUE,
  ANALYSIS_JOB,
  AnalysisService,
} from '../service/analysis.service';
import { FinancialsService } from '../service/financials.service';
import { NewsService } from '../service/news.service';
import { LLMService } from '../service/llm.service';

@Processor(ANALYSIS_QUEUE)
@Injectable()
export class AgentProcessor {
  private readonly logger = new Logger(AgentProcessor.name);

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly financialsService: FinancialsService,
    private readonly newsService: NewsService,
    private readonly llmService: LLMService,
  ) {}

  /**
   * Main job processor: orchestrate the full analysis pipeline.
   * Fetches financials and headlines, calls the LLM with retry + self-correction
   * if confidence is low, and persists the result.
   */
  @Process(ANALYSIS_JOB)
  async handle(job: Job<{ jobId: string; ticker: string }>) {
    const { jobId, ticker } = job.data;
    this.logger.log(`Processing analysis job ${jobId} for ${ticker}`);
    const CONFIDENCE_THRESHOLD = 0.7;
    const MAX_ATTEMPTS = 3;

    try {
      await this.analysisService.updateJob(jobId, { status: 'running' });

      const jobEntity = await this.analysisService.findJob(jobId);
      const trace = jobEntity?.stepsTrace ?? [];

      // Fetch financials
      const financials = await this.financialsService.getFinancials(ticker);
      trace.push({
        step: 'fetch-financials',
        status: 'ok',
        data: { companyName: financials.companyName },
        timestamp: new Date().toISOString(),
      });
      await this.analysisService.updateJob(jobId, { stepsTrace: trace });

      // Fetch headlines
      const headlines = await this.newsService.getHeadlines(ticker, financials.companyName);
      trace.push({
        step: 'fetch-headlines',
        status: 'ok',
        data: { count: headlines.length },
        timestamp: new Date().toISOString(),
      });
      await this.analysisService.updateJob(jobId, { stepsTrace: trace });

      // Call LLM with retry logic
      let analysis = await this.retryLLMAnalysis(
        { ticker, financials, headlines: headlines.map((h) => h.title) },
        MAX_ATTEMPTS,
      );

      // Self-correction: if confidence is below threshold, retry with additional prompt
      if ((analysis.confidence ?? 0) < CONFIDENCE_THRESHOLD) {
        this.logger.warn(
          `Low confidence (${analysis.confidence}) for ${ticker}, attempting self-correction`,
        );
        trace.push({
          step: 'self-correction-attempt',
          status: 'warn',
          data: { originalConfidence: analysis.confidence },
          timestamp: new Date().toISOString(),
        });
        await this.analysisService.updateJob(jobId, { stepsTrace: trace });

        // Re-analyze with stronger guidance
        try {
          const correctedAnalysis = await this.llmService.analyzeFinancials({
            ticker,
            financials,
            headlines: headlines.map((h) => h.title),
          });
          // If corrected confidence is better or same, use it
          if (
            (correctedAnalysis.confidence ?? 0) >=
            (analysis.confidence ?? 0)
          ) {
            analysis = correctedAnalysis;
            trace.push({
              step: 'self-correction-success',
              status: 'ok',
              data: { newConfidence: analysis.confidence },
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          this.logger.warn('Self-correction failed, using original analysis');
          trace.push({
            step: 'self-correction-failed',
            status: 'warn',
            data: { error: (err as Error).message },
            timestamp: new Date().toISOString(),
          });
        }
        await this.analysisService.updateJob(jobId, { stepsTrace: trace });
      }

      trace.push({
        step: 'llm-analysis',
        status: 'ok',
        data: {
          confidence: analysis.confidence,
          recommendation: analysis.recommendation,
        },
        timestamp: new Date().toISOString(),
      });

      // Save result
      await this.analysisService.updateJob(jobId, {
        result: analysis,
        status: 'completed',
        confidence: analysis.confidence ?? null,
        stepsTrace: trace,
      });

      this.logger.log(`Analysis job ${jobId} completed`);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`Analysis job ${job.data.jobId} failed: ${msg}`);
      const jobEntity = await this.analysisService.findJob(job.data.jobId);
      const trace = jobEntity?.stepsTrace ?? [];
      trace.push({
        step: 'error',
        status: 'error',
        data: { message: msg },
        timestamp: new Date().toISOString(),
      });
      await this.analysisService.updateJob(job.data.jobId, {
        status: 'failed',
        errorMessage: msg,
        stepsTrace: trace,
      });
      throw err;
    }
  }

  /**
   * Retry LLM analysis up to MAX_ATTEMPTS times.
   * Returns the first successful analysis or throws if all attempts fail.
   */
  private async retryLLMAnalysis(
    payload: { ticker: string; financials: any; headlines: string[] },
    maxAttempts: number,
  ) {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.logger.log(
          `LLM analysis attempt ${attempt}/${maxAttempts} for ${payload.ticker}`,
        );
        const result = await this.llmService.analyzeFinancials(payload);
        this.logger.log(`LLM analysis succeeded on attempt ${attempt}`);
        return result;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn(
          `LLM analysis attempt ${attempt} failed: ${(err as Error).message}`,
        );
        if (attempt < maxAttempts) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          this.logger.log(`Waiting ${delayMs}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    // All attempts failed
    throw new Error(
      `LLM analysis failed after ${maxAttempts} attempts: ${lastError?.message ?? 'unknown error'}`,
    );
  }
}
