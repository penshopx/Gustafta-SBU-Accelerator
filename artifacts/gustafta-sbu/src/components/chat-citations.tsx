import React from 'react';
import type { SbuChatCitation } from '@workspace/api-client-react';

export function ChatCitations({ citations, notice }: { citations: SbuChatCitation[]; notice: string }) {
  return <section aria-label="Sumber jawaban" style={{ overflowWrap: 'anywhere' }} className="mt-3 min-w-0 max-w-full space-y-3 border-t border-[#d8e4ec] pt-3 text-xs leading-5">
    <p className="text-[#526b81]">{notice}</p>
    {!citations.length && <p className="font-bold text-[#80511b]">Tidak ada kutipan sumber yang digunakan. Rujukan spesifik belum terverifikasi.</p>}
    {citations.map(source => <article key={source.id} className="min-w-0 max-w-full rounded-lg border border-[#d8e4ec] bg-[#f7fbfe] p-3">
      <p className="font-bold">[{source.id}] {source.document}</p>
      <p>{source.version}</p>
      <p className="font-semibold">{source.locator}</p>
      <p className={source.verificationStatus === 'verified' ? 'font-bold text-[#19634b]' : 'font-bold text-[#80511b]'}>
        {source.verificationStatus === 'verified' ? 'Terverifikasi terbatas' : 'Belum terverifikasi'} — {source.verificationScope}
      </p>
      <p>Status: {source.documentStatus}</p>
      <p>Ringkasan (bukan kutipan verbatim): {source.excerpt}</p>
      <p>Batas verifikasi: {source.limitation}</p>
      <p>Pemeriksaan terdokumentasi: {source.checkedOn.slice(0, 10)}</p>
      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[#1769d1] underline">Buka sumber / kanal penerbit</a>
    </article>)}
  </section>;
}

export function chatAnswerForCopy(content: string, citations: SbuChatCitation[] = [], notice = '') {
  return [content, notice, ...citations.map(s =>
    `[${s.id}] ${s.document}\n${s.version}\n${s.locator}\n${s.verificationStatus === 'verified' ? 'Terverifikasi terbatas' : 'Belum terverifikasi'}: ${s.verificationScope}\nStatus: ${s.documentStatus}\nRingkasan: ${s.excerpt}\nBatas verifikasi: ${s.limitation}\nPemeriksaan: ${s.checkedOn.slice(0, 10)}\n${s.sourceUrl}`
  )].filter(Boolean).join('\n\n');
}
