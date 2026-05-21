import { IsString, IsNotEmpty, Length } from 'class-validator';

export class CreateAnalysisDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 10)
  ticker!: string;
}