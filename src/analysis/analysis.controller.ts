import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AnalysisService } from './service/analysis.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  // POST /analysis — start a new analysis
  @Post()
  async startAnalysis(@Body() dto: CreateAnalysisDto) {
    if (!dto.ticker) throw new BadRequestException('ticker is required');
    const job = await this.analysisService.createJob(dto.ticker);
    return {
      jobId: job.id,
      ticker: job.ticker,
      status: job.status,
      message: 'Analysis started — poll /analysis/:jobId/status to track progress',
    };
  }

  // GET /analysis/:jobId/status — check progress + see agent steps
  @Get(':jobId/status')
  async getStatus(@Param('jobId') jobId: string) {
    const job = await this.analysisService.findJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    return {
      jobId: job.id,
      ticker: job.ticker,
      status: job.status,
      confidence: job.confidence,
      stepsTrace: job.stepsTrace,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      ...(job.errorMessage && { errorMessage: job.errorMessage }),
    };
  }

  // GET /analysis/:jobId/result — get the final JSON report
  @Get(':jobId/result')
  async getResult(@Param('jobId') jobId: string) {
    const job = await this.analysisService.findJob(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    if (job.status === 'pending' || job.status === 'running') {
      return {
        jobId: job.id,
        status: job.status,
        message: 'Analysis still in progress — try again shortly',
      };
    }

    if (job.status === 'failed') {
      return {
        jobId: job.id,
        status: 'failed',
        errorMessage: job.errorMessage,
      };
    }
    // completed — return the full report
    return job.result;
  }
}