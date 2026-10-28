import * as React from 'react';
import { getKnowledgeSourcePdf, type KnowledgeSource } from '@workspace/api-client-react';
import { useAccountReadOptions } from './account-queries';
import { KnowledgePdfCanvas } from './knowledge-pdf-canvas';

// Never put an owner, token, storage path or signed URL in an iframe URL.
// The session/immutable-owner GET returns a blob; closing this view releases it.
export function KnowledgeSourcePdf({ source }: { source: KnowledgeSource }) {
  const options = useAccountReadOptions();
  const [url, setUrl] = React.useState<string>();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState(false);
  const current = React.useRef<{ controller: AbortController; url?: string } | undefined>(undefined);
  const clear = React.useCallback(() => {
    current.current?.controller.abort();
    if (current.current?.url) URL.revokeObjectURL(current.current.url);
    current.current = undefined;
  }, []);
  React.useEffect(() => {
    setUrl(undefined); setError(false); setPending(false);
    return clear;
  }, [source.id, source.pdf?.sha256, clear]);
  if (!source.pdf) return null;
  const pdf = source.pdf;
  const open = async () => {
    clear();
    const request = { controller: new AbortController(), url: undefined as string | undefined };
    current.current = request;
    setPending(true); setError(false); setUrl(undefined);
    try {
      const blob = await getKnowledgeSourcePdf(source.id, {
        ...options.request, responseType: 'blob', signal: request.controller.signal,
      });
      if (current.current !== request || request.controller.signal.aborted) return;
      if (!(blob instanceof Blob) || blob.type !== 'application/pdf' || !blob.size) throw new Error('invalid_pdf');
      request.url = URL.createObjectURL(blob);
      setUrl(request.url);
    } catch {
      if (current.current === request && !request.controller.signal.aborted) setError(true);
    } finally {
      if (current.current === request) setPending(false);
    }
  };
  return <div className="border-t border-[#e1eaf0] px-6 py-5" data-testid="source-pdf">
    <h3 className="font-bold text-[#27425a]">PDF asli — salinan unggahan</h3>
    <p className="mt-2 text-xs leading-5 text-[#58708a]">
      Buka halaman PDF {pdf.page} dari {pdf.pageCount}, bukan nomor slide cetak.
      Salinan ini belum diautentikasi penerbit. Usulan timeline dan perbedaan uraian SMAP tetap perlu telaah; membuka PDF tidak memverifikasi aturan.
    </p>
    <button type="button" onClick={open} disabled={pending} className="btn btn-outline mt-3" data-testid="button-source-pdf">
      {pending ? 'Memuat PDF…' : error ? 'Coba buka PDF lagi' : `Buka PDF halaman ${pdf.page}`}
    </button>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">PDF belum dapat dibuka. Sumber mungkin berubah atau penyimpanan terganggu. Muat ulang daftar atau coba lagi.</p>}
    {url && <>
      <p className="mt-3 text-xs text-[#58708a]">Pratinjau menampilkan halaman PDF, bukan nomor slide. PDF yang sudah dibuka atau diunduh tidak dapat ditarik dari perangkat Anda.</p>
      <KnowledgePdfCanvas key={url} url={url} initialPage={pdf.page} pageCount={pdf.pageCount} />
      <a href={`${url}#page=${pdf.page}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-bold text-[#1769d1] underline">Buka PDF di tab baru</a>
      <a href={url} download={pdf.filename} className="ml-4 mt-3 inline-block text-sm font-bold text-[#1769d1] underline">Unduh salinan PDF</a>
    </>}
    <details className="mt-3 break-all text-xs text-[#58708a]"><summary>Identitas salinan (SHA-256)</summary>{pdf.sha256}</details>
  </div>;
}
