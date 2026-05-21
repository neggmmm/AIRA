import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepTrace {
  step: string;
  status: 'ok' | 'warn' | 'error';
  data?: any;
  timestamp: string;
}

@Entity()
export class AnalysisJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  ticker!: string;

  @Column({ default: 'pending' })
  status!: JobStatus;

  @Column({ type: 'jsonb', nullable: true })
  result!: object | null;

  @Column({ type: 'jsonb', nullable: true })
  stepsTrace!: StepTrace[] | null;

  @Column({ type: 'float', nullable: true })
  confidence!: number | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}