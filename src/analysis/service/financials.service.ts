import { Injectable, Logger } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import { FinancialData } from '../dto/financial-data.dto';
import { FinancialDataMapper } from '../mappers/financial-data.mapper';

@Injectable()
export class FinancialsService {
  private readonly logger = new Logger(FinancialsService.name);
  private readonly yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

  async getFinancials(ticker: string): Promise<FinancialData> {
    try {
      this.logger.log(`Fetching financials for: ${ticker}`);

      const [quoteSummary, quote] = await Promise.all([
        this.yahooFinance.quoteSummary(ticker, {
          modules: ['financialData', 'defaultKeyStatistics', 'summaryProfile'],
        }),
        this.yahooFinance.quote(ticker),
      ]);

      const yahooData = {
        price: quote ?? {},
        financialData: quoteSummary.financialData ?? {},
        defaultKeyStatistics: quoteSummary.defaultKeyStatistics ?? {},
        summaryProfile: quoteSummary.summaryProfile ?? {},
      };

      const data = FinancialDataMapper.mapFromYahooFinance(ticker, yahooData);
      this.logger.log(`Financials fetched for ${ticker}: $${data.currentPrice}`);
      return data;

    } catch (error) {
      this.logger.warn(`Yahoo Finance failed for ${ticker} — returning empty financials`);
      return {
        ticker: ticker.toUpperCase(),
        companyName: ticker.toUpperCase(),
        currentPrice: null,
        currency: 'USD',
        marketCap: null,
        peRatio: null,
        forwardPE: null,
        revenueGrowth: null,
        grossMargins: null,
        profitMargins: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        analystRecommendation: null,
        targetMeanPrice: null,
        sector: null,
        industry: null,
        source: 'unavailable — Yahoo Finance did not respond',
      };
    }
  }
}