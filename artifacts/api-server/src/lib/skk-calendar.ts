// Calendar indicators describe entered dates only, never certificate authenticity.
export function jakartaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function validCalendarDay(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function declaredDateStatus(issuedOn: string | null, expiresOn: string | null, today: string) {
  const daysRemaining = expiresOn === null ? null :
    Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const dateStatus = issuedOn !== null && issuedOn > today ? "not_yet_effective" :
    daysRemaining === null ? "unknown" : daysRemaining < 0 ? "expired" :
    daysRemaining <= 30 ? "expiring" : "active_declared";
  return { dateStatus, daysRemaining };
}
