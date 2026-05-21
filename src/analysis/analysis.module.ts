import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AnalysisController } from './analysis.controller';
import { AnalysisService, ANALYSIS_QUEUE } from './service/analysis.service';
import { AnalysisJob } from './entities/analysis-job.entity';
import { NewsService } from './service/news.service';
import { FinancialsService } from './service/financials.service';
import { LLMService } from './service/llm.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalysisJob]),
    BullModule.registerQueue({ name: ANALYSIS_QUEUE }),
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService, NewsService, FinancialsService, LLMService],
  exports: [AnalysisService, NewsService, FinancialsService, LLMService],
})
export class AnalysisModule {}