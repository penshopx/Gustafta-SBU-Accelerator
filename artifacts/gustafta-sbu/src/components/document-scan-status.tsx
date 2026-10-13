import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  completeCaseDocumentUpload, getListCaseDocumentsQueryKey, getListDocumentVaultQueryKey,
  type CaseDocument,
} from '@workspace/api-client-react';
import { useFormMutationOptions } from './account-queries';

export function documentScanLabel(doc: Pick<CaseDocument, 'status' | 'scanStatus'>) {
  if (doc.status !== 'ready') return 'Unggahan belum selesai';
  if (doc.scanStatus === 'clean') return 'Tidak terdeteksi malware — bukan verifikasi bukti/regulasi';
  if (doc.scanStatus === 'infected') return 'Dikarantina: malware atau risiko keamanan terdeteksi. Unduhan diblokir.';
  if (doc.scanStatus === 'error') return 'Pemindaian gagal/tidak tersedia. Berkas tetap tersimpan privat; unduhan diblokir.';
  return 'Karantina: belum selesai dipindai. Unduhan diblokir.';
}

export function DocumentScanStatus({ doc, expectedUserId }: { doc: CaseDocument; expectedUserId: string }) {
  const qc = useQueryClient();
  const options = useFormMutationOptions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retry = async () => {
    if (doc.ownerId !== expectedUserId || busy) return;
    setBusy(true); setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 420_000);
    try {
      const result = await completeCaseDocumentUpload(doc.caseId, doc.id, { ...options.request, signal: controller.signal });
      if (result.ownerId !== expectedUserId || result.caseId !== doc.caseId) throw new Error('owner');
    } catch {
      setError('Pemindaian belum dapat dikonfirmasi. Berkas tidak dihapus; muat ulang atau coba lagi.');
    } finally {
      clearTimeout(timer); setBusy(false);
      void qc.invalidateQueries({ queryKey: getListCaseDocumentsQueryKey(doc.caseId) });
      void qc.invalidateQueries({ queryKey: getListDocumentVaultQueryKey() });
    }
  };
  return <div className="mt-1 text-xs text-[#365a76]" data-testid={`scan-status-${doc.id}`}>
    <p role="status">{busy ? 'Memindai malware secara lokal. Berkas tetap dikarantina...' : documentScanLabel(doc)}</p>
    {doc.status === 'ready' && (doc.scanStatus === 'pending' || doc.scanStatus === 'error') &&
      <button data-testid={`button-retry-scan-${doc.id}`} disabled={busy} className="mt-1 font-bold underline" onClick={() => void retry()}>
        {busy ? 'Memindai...' : doc.scanStatus === 'error' ? 'Coba pindai lagi' : 'Pindai dokumen'}
      </button>}
    {error && <p role="alert" className="mt-1 text-[#ad4a48]">{error}</p>}
  </div>;
}
