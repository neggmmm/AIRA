export interface FinancialData {
  ticker: string;
  companyName: string;
  currentPrice: number | null;
  currency: string;
  marketCap: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  revenueGrowth: number | null;
  grossMargins: number | null;
  profitMargins: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  analystRecommendation: string | null;
  targetMeanPrice: number | null;
  sector: string | null;
  industry: string | null;
  source: string;
}
