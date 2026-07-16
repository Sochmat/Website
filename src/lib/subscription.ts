export const GST_RATE = 0.05;
export const SUBSCRIPTION_HOST_PREFIX = "subscription.";

/** True when the request host is the subscription subdomain (port/case-insensitive). */
export function isSubscriptionHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return host.toLowerCase().split(":")[0].startsWith(SUBSCRIPTION_HOST_PREFIX);
}

export function generatePlanNumber(): string {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SUBP-${t}-${r}`;
}
