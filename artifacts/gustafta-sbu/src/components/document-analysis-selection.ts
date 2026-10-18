// Keep the input short and expand at most ten pages, even for huge ranges.
export function parseAnalysisPages(text: string, count: number): number[] | null {
  if (!text.trim() || text.length > 200) return null;
  const pages: number[] = [];
  for (const part of text.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) return null;
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start < 1 || end < start || end > count || end - start >= 10) return null;
    for (let p = start; p <= end; p++) {
      if (pages.includes(p) || pages.length >= 10) return null;
      pages.push(p);
    }
  }
  return pages.length ? pages : null;
}
