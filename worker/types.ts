export interface WorkerEnv {
  KV_REST_API_URL: string;
  KV_REST_API_TOKEN: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_BASE_URL?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  PUSH_SECRET?: string;
  PUSH_ENABLED?: string;
  PUSH_DELIVERY_QUEUE?: WorkerQueue<PushDeliveryMessage>;
  RATE_LIMIT_SALT: string;
  FRONTEND_ORIGIN: string;
  PUBCRAWL_BUSINESS_ADMIN_KEY?: string;
  PUBCRAWL_BUSINESS_SIGNING_KEY?: string;
  PUBCRAWL_BUSINESS_MEMORY?: string;
  PUBCRAWL_PUBLIC_ORIGIN?: string;
  PUBCRAWL_CONTACT_EMAIL?: string;
  PUBCRAWL_MERCHANT_NAME?: string;
  PUBCRAWL_EMAIL_FROM?: string;
  PUBCRAWL_AFFILIATE_LINKS_JSON?: string;
  PUBCRAWL_PUBLIC_OFFERS?: string;
  PUBCRAWL_WORKSHOP_JSON?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
}

export interface DailyPushDeliveryMessage {
  kind: 'daily';
  campaignDate: string;
  recipientHash: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { auth: string; p256dh: string };
  };
  attempt: number;
}

export interface WelcomePushDeliveryMessage {
  kind: 'welcome';
  recipientHash: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { auth: string; p256dh: string };
  };
  attempt: 0;
}

export type PushDeliveryMessage = DailyPushDeliveryMessage | WelcomePushDeliveryMessage;

export interface WorkerQueue<T> {
  send(message: T, options?: { delaySeconds?: number }): Promise<void>;
  sendBatch(messages: Array<{ body: T }>): Promise<void>;
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
