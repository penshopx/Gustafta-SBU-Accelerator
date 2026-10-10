import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import {
  useUpdateCaseDocumentMetadata, getListCaseDocumentsQueryKey, getListDocumentVaultQueryKey,
  type CaseDocument, type DocumentMetadataInput,
} from '@workspace/api-client-react';
import { useFormMutationOptions } from './account-queries';

export const categoryLabels: Record<string, string> = {
  legalitas: 'Legalitas', keuangan: 'Keuangan', personel: 'Personel', peralatan: 'Peralatan',
  pengalaman: 'Pengalaman', smap: 'SMAP', lainnya: 'Lainnya',
};
export const categoryKeys = Object.keys(categoryLabels) as DocumentMetadataInput['category'][];

export function SimpleModal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [close]);
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0d1b2ad9] p-3 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-label={title} className={`surface my-auto w-full min-w-0 overflow-hidden shadow-2xl ${wide ? 'max-w-[720px]' : 'max-w-[520px]'}`}>
      <div className="flex items-center justify-between gap-3 border-b border-[#d8e4ec] p-4 sm:p-5"><h2 className="display min-w-0 break-words text-lg font-extrabold">{title}</h2><button data-testid="button-close-dialog" onClick={close} aria-label="Tutup" className="shrink-0 rounded-lg p-2 hover:bg-[#ecf4f9]"><X size={18} /></button></div>
      <div className="p-4 sm:p-5">{children}</div>
    </section></div>;
}

export function DocumentMetadataDialog({ doc, expectedUserId, close }: { doc: CaseDocument; expectedUserId: string; close: () => void }) {
  const qc = useQueryClient();
  const options = useFormMutationOptions();
  const mutation = useUpdateCaseDocumentMetadata(options);
  const [name, setName] = useState(doc.name);
  const [category, setCategory] = useState<DocumentMetadataInput['category']>(doc.category ?? 'lainnya');
  const [description, setDescription] = useState(doc.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault(); if (!valid || mutation.isPending) return; setError(null);
    mutation.mutate({ id: doc.caseId, documentId: doc.id, data: { name: name.trim(), category, description: description.trim() } }, {
      onSuccess: updated => {
        if (updated.ownerId !== expectedUserId || updated.id !== doc.id || updated.caseId !== doc.caseId) { setError('Respons tidak sesuai akun. Muat ulang halaman.'); return; }
        void qc.invalidateQueries({ queryKey: getListCaseDocumentsQueryKey(doc.caseId) });
        void qc.invalidateQueries({ queryKey: getListDocumentVaultQueryKey() });
        close();
      },
      onError: () => setError('Metadata belum tersimpan. Berkas tidak berubah; coba lagi.'),
    });
  };
  return <SimpleModal title="Ubah keterangan dokumen" close={close}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Nama dokumen</span><input data-testid="input-document-name" className="field" maxLength={180} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Kategori</span><select data-testid="select-document-category" className="field" value={category} onChange={e => setCategory(e.target.value as DocumentMetadataInput['category'])}>{categoryKeys.map(k => <option key={k} value={k}>{categoryLabels[k]}</option>)}</select></label>
      <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Catatan</span><textarea data-testid="input-document-description" className="field min-h-[96px]" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /><span className="mt-1 block text-right text-[11px] text-[#688096]">{description.length}/2000</span></label>
      <p className="text-xs text-[#617a90]">Hanya nama, kategori, dan catatan yang berubah. Isi berkas tetap sama.</p>
      {error && <p role="alert" className="text-sm text-[#b34442]">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-[#e0e9ef] pt-4"><button type="button" onClick={close} className="btn btn-outline">Batal</button><button data-testid="button-save-document-metadata" disabled={!valid || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan'}</button></div>
    </form></SimpleModal>;
}
