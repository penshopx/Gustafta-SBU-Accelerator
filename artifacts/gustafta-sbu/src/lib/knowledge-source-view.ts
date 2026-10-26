import type { KnowledgeSource } from '@workspace/api-client-react';

export const roleLabels: Record<string, string> = {
  primer: 'Sumber primer', referensi_klasifikasi: 'Referensi klasifikasi', panduan: 'Panduan', praktik: 'Praktik',
};
export const verificationLabels: Record<string, string> = { verified: 'Metadata sumber terverifikasi', unverified: 'Metadata sumber belum terverifikasi' };

export type SourceFilters = { query: string; role: string; status: string; topic: string };
export const emptyFilters: SourceFilters = { query: '', role: '', status: '', topic: '' };

export function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

// Only an explicitly printed page marker in the stored locator counts.
export function hasPrintedLocator(locator: string): boolean {
  return /\bhalaman\s+cetak\b|\bcetak\s*(?:hlm\.?\s*)?\d|\bprinted\s+page\b/i.test(locator);
}

export function hasPdfLocator(locator: string): boolean {
  return /\bPDF\s*(?:(?:hlm\.?|halaman|page)\s*)?\d/i.test(locator);
}
export function sourceTopics(sources: KnowledgeSource[]): string[] {
  return [...new Set(sources.flatMap((s) => s.topics))].sort((a, b) => a.localeCompare(b, 'id'));
}
export function sourceRoles(sources: KnowledgeSource[]): string[] {
  return [...new Set(sources.map((s) => s.sourceRole))];
}

export function filterSources(sources: KnowledgeSource[], f: SourceFilters): KnowledgeSource[] {
  const q = f.query.trim().toLocaleLowerCase('id');
  return sources.filter((s) => {
    if (f.role && s.sourceRole !== f.role) return false;
    if (f.status && s.verificationStatus !== f.status) return false;
    if (f.topic && !s.topics.includes(f.topic)) return false;
    if (!q) return true;
    return [s.document, s.excerpt, s.locator, s.version, s.versionId, ...s.topics].some((v) => v.toLocaleLowerCase('id').includes(q));
  });
}

export function selectSource(sources: KnowledgeSource[] | undefined, id: string | null): KnowledgeSource | undefined {
  return id && sources ? sources.find((s) => s.id === id) : undefined;
}
