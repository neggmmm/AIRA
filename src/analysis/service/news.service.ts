import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface NewsArticle {
  title: string;
  description: string | null;
  source: string;
  publishedAt: string;
  url: string;
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://newsapi.org/v2';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('NEWS_API_KEY') ?? '';
  }

  async getHeadlines(ticker: string, companyName?: string): Promise<NewsArticle[]> {
    const query = companyName ?? ticker;

    try {
      this.logger.log(`Fetching news for: ${query}`);

      const response = await axios.get(`${this.baseUrl}/everything`, {
        params: {
          q: query,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 10,
          apiKey: this.apiKey,
        },
        timeout: 8000,
      });

      const articles: NewsArticle[] = response.data.articles.map((a: any) => ({
        title: a.title,
        description: a.description,
        source: a.source?.name ?? 'unknown',
        publishedAt: a.publishedAt,
        url: a.url,
      }));

      this.logger.log(`Found ${articles.length} articles for ${query}`);
      return articles;

    } catch (error) {
      this.logger.warn(`NewsAPI failed for ${query} — using mock data`);
      return this.getMockNews(ticker);
    }
  }

  private getMockNews(ticker: string): NewsArticle[] {
    this.logger.warn(`Returning empty news for ${ticker} — NewsAPI unavailable`);
    return [];
  }
}