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

  @Process(ANALYSIS_JOB)
  async handle(job: Job<{ jobId: string; ticker: string }>) {
    const { jobId, ticker } = job.data;
    this.logger.log(`Processing analysis job ${jobId} for ${ticker}`);

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

      // Call LLM
      const analysis = await this.llmService.analyzeFinancials({
        ticker,
        financials,
        headlines: headlines.map((h) => h.title),
      });

      trace.push({
        step: 'llm-analysis',
        status: 'ok',
        data: { confidence: analysis.confidence },
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
}
