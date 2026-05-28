export interface Config {
  port: number;
  intentThreshold: number;
  tavilyApiKey?: string;
  fraudRevenueCeiling: number;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): Config {
  const tavilyApiKey = process.env.TAVILY_API_KEY?.trim();
  return {
    port: numberFromEnv(process.env.PORT, 3000),
    intentThreshold: numberFromEnv(process.env.INTENT_THRESHOLD, 0.85),
    tavilyApiKey: tavilyApiKey ? tavilyApiKey : undefined,
    fraudRevenueCeiling: numberFromEnv(process.env.FRAUD_REVENUE_CEILING, 1000),
  };
}
