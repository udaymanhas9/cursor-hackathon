import { tavily } from "@tavily/core";
import { MarketData } from "../domain/types.js";

export interface SearchService {
  search(query: string): Promise<MarketData>;
}

export class TavilySearch implements SearchService {
  private client: ReturnType<typeof tavily>;

  constructor(apiKey: string) {
    this.client = tavily({ apiKey });
  }

  async search(query: string): Promise<MarketData> {
    try {
      const res = await this.client.search(query, {
        maxResults: 3,
        includeAnswer: true,
      });
      return {
        summary: res.answer ?? "",
        results: (res.results ?? []).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content,
        })),
      };
    } catch (err) {
      // Graceful degradation: never block the ad on search failure.
      console.error("[tavily] search failed, returning empty market data:", err);
      return { summary: "", results: [] };
    }
  }
}

export class MockSearch implements SearchService {
  async search(query: string): Promise<MarketData> {
    return {
      summary: `Mock market summary for "${query}".`,
      results: [
        {
          title: `Top result for ${query}`,
          url: "https://example.com/result-1",
          content: "Sample market content for the boilerplate demo.",
        },
      ],
    };
  }
}

export function createSearchService(apiKey?: string): SearchService {
  return apiKey ? new TavilySearch(apiKey) : new MockSearch();
}
