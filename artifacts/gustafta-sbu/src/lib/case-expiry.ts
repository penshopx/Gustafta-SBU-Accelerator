// The certificate expiry is a calendar date, not an instant in the viewer's time zone.
export function expiryInputValue(value?: string | null): string {
  return value?.slice(0, 10) || '';
}

export function expiryPayload(requestType: 'baru' | 'perpanjangan', value: string): string | null {
  return requestType === 'perpanjangan' ? value || null : null;
}