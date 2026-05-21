import { FinancialData } from '../dto/financial-data.dto';

export class FinancialDataMapper {
  static mapFromYahooFinance(ticker: string, yahooData: any): FinancialData {
    const price = yahooData.price ?? {};
    const financial = yahooData.financialData ?? {};
    const stats = yahooData.defaultKeyStatistics ?? {};
    const profile = yahooData.summaryProfile ?? {};

    return {
      ticker: ticker.toUpperCase(),
      companyName: price.longName ?? price.shortName ?? ticker,
      currentPrice: price.regularMarketPrice?.raw ?? price.regularMarketPrice ?? null,
      currency: price.currency ?? 'USD',
      marketCap: price.marketCap?.raw ?? price.marketCap ?? null,
      peRatio: stats.trailingPE?.raw ?? stats.trailingPE ?? null,
      forwardPE: stats.forwardPE?.raw ?? stats.forwardPE ?? null,
      revenueGrowth: financial.revenueGrowth?.raw ?? financial.revenueGrowth ?? null,
      grossMargins: financial.grossMargins?.raw ?? financial.grossMargins ?? null,
      profitMargins: financial.profitMargins?.raw ?? financial.profitMargins ?? null,
      fiftyTwoWeekHigh: stats.fiftyTwoWeekHigh?.raw ?? stats.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: stats.fiftyTwoWeekLow?.raw ?? stats.fiftyTwoWeekLow ?? null,
      analystRecommendation: financial.recommendationKey ?? null,
      targetMeanPrice: financial.targetMeanPrice?.raw ?? financial.targetMeanPrice ?? null,
      sector: profile.sector ?? null,
      industry: profile.industry ?? null,
      source: 'Yahoo Finance',
    };
  }
}
