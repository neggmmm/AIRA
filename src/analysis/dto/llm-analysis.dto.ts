import { FinancialData } from './financial-data.dto';

export interface LLMAnalysisRequest {
  ticker: string;
  financials: FinancialData;
  headlines: string[];
}

export interface LLMAnalysisResponse {
  ticker: string;
  companyName: string;
  summary: string;
  recommendation: string;
  confidence: number | null;
  reasoning: string;
  riskFactors: string[];
  source: string;
}
