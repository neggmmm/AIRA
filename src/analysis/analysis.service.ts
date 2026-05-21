import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AnalysisJob } from './entities/analysis-job.entity';

export const ANALYSIS_QUEUE = 'analysis';
export const ANALYSIS_JOB = 'run-analysis';

@Injectable()
export class AnalysisService {
  constructor(
    @InjectRepository(AnalysisJob)
    private readonly jobRepo: Repository<AnalysisJob>,

    @InjectQueue(ANALYSIS_QUEUE)
    private readonly analysisQueue: Queue,
  ) {}

  async createJob(ticker: string): Promise<AnalysisJob> {
    // 1. Save job to DB with status pending
    const job = this.jobRepo.create({
      ticker: ticker.toUpperCase(),
      status: 'pending',
      stepsTrace: [],
    });
    await this.jobRepo.save(job);

    // 2. Push to BullMQ — this wakes up the worker
    await this.analysisQueue.add(
      ANALYSIS_JOB,
      { jobId: job.id, ticker: job.ticker },
      {
        attempts: 3,                 // retry up to 3 times on failure
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );

    return job;
  }

  async findJob(jobId: string): Promise<AnalysisJob | null> {
    return this.jobRepo.findOne({ where: { id: jobId } });
  }

  async updateJob(
    jobId: string,
    updates: Partial<AnalysisJob>,
  ): Promise<void> {
    await this.jobRepo.update(jobId, updates);
  }
}