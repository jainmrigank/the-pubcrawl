export const siteOrigin: string;
export const hostingPrice: number;
export type Campaign = Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content', string>>;
export const campaignKeys: ReadonlyArray<keyof Campaign>;
export function cleanCampaign(input: unknown): Campaign;
export const eventNames: Set<string>;
export function trafficSource(campaign: Campaign, referrer?: string): string;
