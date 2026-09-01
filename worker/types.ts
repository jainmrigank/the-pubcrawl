export interface WorkerEnv {
  KV_REST_API_URL: string;
  KV_REST_API_TOKEN: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_BASE_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  PUSH_SECRET?: string;
  RATE_LIMIT_SALT: string;
  FRONTEND_ORIGIN: string;
}

export interface WorkerHealth {
  ok: true;
  runtime: 'cloudflare-worker';
  dataVersion: string;
  cocktails: number;
  catalogueCocktails: number;
  ingredients: number;
  llm: string | null;
  store: 'upstash' | 'unconfigured';
}

