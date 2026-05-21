import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AnalysisController } from './analysis.controller';
import { AnalysisService, ANALYSIS_QUEUE } from './analysis.service';
import { AnalysisJob } from './entities/analysis-job.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalysisJob]),
    BullModule.registerQueue({ name: ANALYSIS_QUEUE }),
  ],
  controllers: [AnalysisController],
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}