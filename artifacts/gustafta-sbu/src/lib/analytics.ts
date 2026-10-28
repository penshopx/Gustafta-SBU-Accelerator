// Only fixed interaction names are accepted; form values and outbound URLs
// must never be passed to the analytics tracker.
export const ANALYTICS_EVENTS = ['service_request_reviewed', 'service_whatsapp_clicked'] as const;
export type AnalyticsEvent = typeof ANALYTICS_EVENTS[number];

declare global {
  interface Window {
    umami?: {
      track(name: string): void | Promise<unknown>;
    };
  }
}

export function trackEvent(name: AnalyticsEvent): void {
  if (typeof window === 'undefined' || !ANALYTICS_EVENTS.includes(name)) return;
  try {
    // Do not await tracking or delay navigation. Absence, synchronous failures
    // and rejected promises are all non-blocking and must not log private data.
    void Promise.resolve(window.umami?.track(name)).catch(() => {});
  } catch {
    // Analytics is optional; the form and WhatsApp link must keep working.
  }
}
