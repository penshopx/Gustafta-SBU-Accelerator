import { useId, useRef, useState } from 'react';
import { CircleCheck, FileSearch, Plus, RotateCcw, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react';
import { compareDocumentIdentities, type IdentityComparison, type IdentityRow } from '@/lib/document-identity';

const MAX = 8;
const FIELD: Record<'companyName' | 'nib' | 'npwp', string> = { companyName: 'Nama badan usaha', nib: 'NIB', npwp: 'NPWP' };
const KIND: Record<'missing' | 'format' | 'mismatch', { title: string; hint: string; cls: string }> = {
  missing: { title: 'Belum diisi', hint: 'Kolom kosong pada berkas berikut, sehingga tidak dapat dibandingkan.', cls: 'border-[#d6dfe7] bg-[#f4f8fb] text-[#2b4159]' },
  format: { title: 'Format tidak sesuai', hint: '', cls: 'border-[#ecc58f] bg-[#fdf1e3] text-[#6b3a08]' },
  mismatch: { title: 'Isian berbeda antar berkas', hint: 'Nilai pada berkas berikut tidak sama setelah dinormalkan. Periksa ejaan dan angka pada dokumen aslinya.', cls: 'border-[#e7b7b5] bg-[#fbe9e8] text-[#7d2927]' },
};
const formatHint = (f: string) => f === 'nib' ? 'NIB diharapkan tepat 13 digit angka (spasi diabaikan). Ini hanya cek ketikan, bukan bukti NIB terdaftar atau berlaku.' : f === 'npwp' ? 'NPWP diharapkan 15 atau 16 digit angka (titik, strip, dan spasi diabaikan).' : 'Isian tidak dapat dibaca sebagai nilai yang sah.';

let seqGlobal = 0;
const newRow = (): IdentityRow => ({ id: `d${++seqGlobal}`, label: '', companyName: '', nib: '', npwp: '' });

export function IdentityConsistency() {
  const id = useId();
  const [rows, setRows] = useState<IdentityRow[]>(() => [newRow(), newRow()]);
  const [result, setResult] = useState<IdentityComparison | null>(null);
  const [notice, setNotice] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);

  const nameOf = (rid: string) => { const i = rows.findIndex(r => r.id === rid); const r = rows[i]; return r?.label.trim() || `Berkas ${i + 1}`; };
  const mixedNpwp = (ids: string[]) => new Set(rows.filter(r => ids.includes(r.id)).map(r => r.npwp.replace(/[.\s-]/gu, '').length)).size > 1;
  const update = (rid: string, k: keyof Omit<IdentityRow, 'id'>, v: string) => { setRows(rs => rs.map(r => r.id === rid ? { ...r, [k]: v } : r)); setResult(null); setNotice('Isian berubah. Bandingkan kembali untuk melihat hasil terbaru.'); };
  const add = () => { if (rows.length >= MAX) return; setRows(rs => [...rs, newRow()]); setResult(null); setNotice(`Berkas ${rows.length + 1} ditambahkan.`); };
  const remove = (rid: string) => { if (rows.length <= 2) return; const n = nameOf(rid); setRows(rs => rs.filter(r => r.id !== rid)); setResult(null); setNotice(`${n} dihapus.`); };
  const compare = () => { const res = compareDocumentIdentities(rows); setResult(res); setNotice(res.issues.length ? `${res.issues.length} catatan ditemukan.` : 'Tidak ada perbedaan terdeteksi pada isian.'); window.setTimeout(() => resultRef.current?.focus(), 0); };
  const reset = () => { setRows([newRow(), newRow()]); setResult(null); setNotice('Semua isian dan hasil dikosongkan.'); };

  return <section id="pemeriksa-identitas" aria-labelledby={`${id}-h`} data-testid="tool-identity" className="surface scroll-mt-6 p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#142c46] text-[#8ec7f4]"><FileSearch size={19} /></span><div><div className="eyebrow text-[#1769d1]">ALAT 03 / BANDINGKAN ISIAN</div><h2 id={`${id}-h`} className="display text-xl font-extrabold">Pemeriksa konsistensi identitas berkas</h2></div></div>
      <span data-testid="text-identity-count" className="mono rounded-md bg-[#eaf4ff] px-2.5 py-1 text-xs font-bold text-[#0c4a96]">{rows.length}/{MAX} berkas</span></div>
    <p className="mt-3 max-w-3xl text-sm leading-6 text-[#526b81]">Ketik ulang nama badan usaha, NIB, dan NPWP seperti tertulis di tiap berkas (mis. akta, NIB, laporan pajak), lalu bandingkan. Alat ini hanya membandingkan teks yang Anda ketik.</p>
    <p role="note" data-testid="text-identity-warning" className="mt-4 flex gap-2.5 rounded-xl border border-[#ecc58f] bg-[#fdf1e3] p-3.5 text-sm leading-6 text-[#6b3a08]"><ShieldAlert size={17} className="mt-0.5 shrink-0" /><span><b>Isian manual, tidak disimpan.</b> Data hanya diproses di browser ini, tidak dikirim ke server, cloud, atau AI, dan hilang saat halaman ditutup. Hindari mengetik data yang tidak perlu. Hasil tidak memverifikasi keabsahan ke OSS, DJP, atau LSBU; cocokkan sendiri dengan dokumen asli dan sumber resmi.</span></p>

    <ol className="mt-5 grid gap-3 md:grid-cols-2">{rows.map((r, i) => <li key={r.id} data-testid={`row-identity-${i}`} className="rounded-xl border border-[#d1dfe9] bg-white p-4">
      <div className="flex items-center justify-between gap-2"><span className="mono text-[11px] font-bold uppercase tracking-widest text-[#56718a]">Berkas {i + 1}</span>{rows.length > 2 && <button type="button" data-testid={`button-remove-identity-${i}`} onClick={() => remove(r.id)} aria-label={`Hapus ${r.label.trim() || `Berkas ${i + 1}`}`} className="rounded-lg p-2 text-[#9a3432] hover:bg-[#fbe9e8]"><Trash2 size={15} /></button>}</div>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
        {([['label', 'Nama berkas', `Mis. Akta pendirian`, 80], ['companyName', 'Nama badan usaha', 'Sesuai tertulis', 200], ['nib', 'NIB', '13 digit', 40], ['npwp', 'NPWP', '15 atau 16 digit', 40]] as const).map(([k, l, ph, max]) => <div key={k} className={k === 'companyName' ? 'sm:col-span-2' : k === 'label' ? 'sm:col-span-2' : ''}><label htmlFor={`${id}-${r.id}-${k}`} className="mb-1 block text-xs font-bold text-[#2b4159]">{l}</label><input id={`${id}-${r.id}-${k}`} data-testid={`input-identity-${k}-${i}`} className={`field ${k === 'nib' || k === 'npwp' ? 'mono' : ''}`} inputMode={k === 'nib' || k === 'npwp' ? 'numeric' : undefined} autoComplete="off" maxLength={max} placeholder={ph} value={r[k]} onChange={e => update(r.id, k, e.target.value)} /></div>)}
      </div>
    </li>)}</ol>

    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" data-testid="button-compare-identity" onClick={compare} className="btn btn-primary"><FileSearch size={15} /> Bandingkan</button>
      <button type="button" data-testid="button-add-identity" onClick={add} disabled={rows.length >= MAX} className="btn btn-outline"><Plus size={15} /> Tambah berkas</button>
      <button type="button" data-testid="button-reset-identity" onClick={reset} className="btn btn-outline"><RotateCcw size={15} /> Reset</button>
    </div>
    {rows.length >= MAX && <p className="mt-2 text-xs text-[#526b81]">Batas {MAX} berkas tercapai.</p>}
    <p className="sr-only" role="status" aria-live="polite">{notice}</p>

    {result && <div ref={resultRef} tabIndex={-1} data-testid="result-identity" aria-label="Hasil perbandingan" className="mt-5 rounded-xl border border-[#d1dfe9] bg-[#f9fcfe] p-4 outline-none focus-visible:ring-2 focus-visible:ring-[#1769d1]">
      <p className="mono text-[11px] font-bold uppercase tracking-widest text-[#56718a]">{result.documentCount} berkas / {result.comparableFields} kolom dapat dibandingkan</p>
      {result.comparableFields === 0 && <p data-testid="text-identity-nothing" className="mt-3 text-sm font-bold text-[#7d2927]">Belum ada kolom yang terisi dengan format wajar di minimal dua berkas, jadi belum ada yang dapat dibandingkan.</p>}
      {result.issues.length === 0 && result.comparableFields > 0
        ? <p data-testid="text-identity-consistent" className="mt-3 flex gap-2.5 rounded-lg border border-[#b9dccf] bg-[#e3f4ee] p-3.5 text-sm leading-6 text-[#155f4e]"><CircleCheck size={17} className="mt-0.5 shrink-0" /><span><b>Tidak ada perbedaan terdeteksi pada isian Anda.</b> Ini hanya berarti teks yang diketik sama dan berformat wajar, bukan bukti keabsahan dokumen atau kelulusan sertifikasi.</span></p>
        : <ul className="mt-3 grid gap-2">{result.issues.length > 0 && result.issues.map((iss, n) => { const k = KIND[iss.kind]; return <li key={n} data-testid={`issue-identity-${n}`} className={`rounded-lg border p-3.5 text-sm leading-6 ${k.cls}`}>
          <p className="flex items-center gap-2 font-bold"><TriangleAlert size={15} className="shrink-0" />{FIELD[iss.field]}: {k.title}</p>
          <p className="mt-0.5">{iss.kind === 'format' ? formatHint(iss.field) : k.hint}</p>
          {iss.kind === 'mismatch' && iss.field === 'npwp' && mixedNpwp(iss.documentIds) && <p data-testid="text-identity-npwp-length" className="mt-1">Sebagian NPWP berisi 15 digit dan sebagian 16 digit. Alat ini tidak mengonversi atau menyamakan keduanya; telaah manual kesesuaiannya dengan dokumen asli dan sumber resmi.</p>}
          <p className="mt-1 font-semibold">Berkas: {iss.documentIds.map(nameOf).join(', ')}</p>
        </li>; })}</ul>}
      <p className="mt-3 text-xs leading-5 text-[#526b81]">Perubahan isian akan menghapus hasil ini. Verifikasi mandiri tetap diperlukan.</p>
    </div>}
  </section>;
}
