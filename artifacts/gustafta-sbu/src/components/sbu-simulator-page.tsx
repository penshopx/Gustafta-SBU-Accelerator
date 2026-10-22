import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, Download, RotateCcw } from 'lucide-react';
import {
  createSimulatorDraft, simulatorProfileErrors, evaluateSimulator, simulatorReportText,
  SIMULATOR_AREAS, SIMULATOR_LIMITATION, type SimulatorDraft, type SimulatorDocumentStatus, type SimulatorAreaId,
} from '@/lib/sbu-simulator';

const STEPS = ['Profil', 'Dokumen dan personel', 'Pengalaman', 'Hasil dan tindakan'];
const STATUS_OPTIONS: { value: SimulatorDocumentStatus; label: string }[] = [
  { value: 'belum_diperiksa', label: 'Belum diperiksa' },
  { value: 'belum_tersedia', label: 'Belum tersedia' },
  { value: 'tersedia', label: 'Tersedia' },
  { value: 'perlu_perbaikan', label: 'Perlu perbaikan' },
  { value: 'tidak_relevan', label: 'Tidak relevan (NA)' },
];
const SEVERITY: Record<string, string> = { missing: 'Belum lengkap', conflict: 'Perlu diperiksa', review: 'Tinjauan manusia' };
const SEV_CLASS: Record<string, string> = { missing: 'bg-[#fdf1e3] text-[#8a4b0b]', conflict: 'bg-[#fbe9e8] text-[#9a3432]', review: 'bg-[#e6f1fb] text-[#175eae]' };

const exampleDraft = (): SimulatorDraft => {
  const d = createSimulatorDraft();
  d.companyName = 'DATA CONTOH - PT Contoh Simulasi'; d.subclassification = 'Contoh subklasifikasi (bukan data nyata)'; d.qualification = 'Contoh kualifikasi';
  d.firstSbu = 'ya';
  d.documents.legalitas = { status: 'tersedia', reference: 'Contoh: akta versi 1', companyName: 'DATA CONTOH - PT Contoh Simulasi', note: '' };
  d.documents.keuangan = { status: 'belum_tersedia', reference: '', companyName: '', note: '' };
  d.documents.personel = { status: 'perlu_perbaikan', reference: '', companyName: '', note: 'Contoh: penugasan belum dirinci' };
  return d;
};

function Fld({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: boolean; children: ReactNode }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-xs font-bold text-[#2b4159]">{label}</label>{children}{hint && <p id={`${id}-hint`} className="mt-1 text-xs text-[#688096]">{hint}</p>}{error && <span className="sr-only">Wajib diisi</span>}</div>;
}

export default function SbuSimulatorPage() {
  const [draft, setDraft] = useState<SimulatorDraft>(createSimulatorDraft);
  const [step, setStep] = useState(0);
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [isExample, setIsExample] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    const title = document.title;
    let meta = document.querySelector('meta[name="description"]');
    const created = !meta;
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'description'); document.head.appendChild(meta); }
    const prev = meta.getAttribute('content');
    document.title = 'Simulator SBU - Gustafta';
    meta.setAttribute('content', 'Latihan deklarasi persiapan SBU secara lokal di browser. Bukan verifikasi, bukan sertifikasi, tanpa unggahan dan tanpa AI.');
    return () => { document.title = title; if (created) meta!.remove(); else if (prev !== null) meta!.setAttribute('content', prev); };
  }, []);
  useEffect(() => { if (first.current) { first.current = false; return; } headingRef.current?.focus(); window.scrollTo({ top: 0 }); }, [step]);

  const set = <K extends keyof SimulatorDraft>(k: K, v: SimulatorDraft[K]) => setDraft(d => ({ ...d, [k]: v }));
  const setDoc = (id: SimulatorAreaId, patch: Partial<SimulatorDraft['documents'][SimulatorAreaId]>) => setDraft(d => ({ ...d, documents: { ...d.documents, [id]: { ...d.documents[id], ...patch } } }));
  const areas = SIMULATOR_AREAS.filter(a => a.id !== 'sbu_lama' || draft.requestType === 'perpanjangan');
  const profileErrors = simulatorProfileErrors(draft);
  const naErrors = areas.filter(a => draft.documents[a.id].status === 'tidak_relevan' && !draft.documents[a.id].note.trim());
  const result = useMemo(() => evaluateSimulator(draft), [draft]);

  const stepErrors = (s: number): string[] => s === 0 ? profileErrors : s === 1 ? naErrors.map(a => `${a.label}: isi alasan tidak relevan; pilihan ini memerlukan tinjauan manusia.`) : s === 2 && !draft.acknowledge ? ['Centang pernyataan batas simulator sebelum melihat hasil.'] : [];
  const errs = stepErrors(step);
  const showErrs = attempted[step] && errs.length > 0;
  const next = () => { setAttempted(a => ({ ...a, [step]: true })); if (errs.length === 0) setStep(step + 1); };
  const goStep = (i: number) => { if (i <= step) setStep(i); };

  const download = () => {
    const url = URL.createObjectURL(new Blob([simulatorReportText(draft)], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'hasil-simulator-sbu.txt';
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const reset = () => { setDraft(createSimulatorDraft()); setStep(0); setAttempted({}); setIsExample(false); setConfirmReset(false); };
  const loadExample = () => { setDraft(exampleDraft()); setIsExample(true); setAttempted({}); };

  const radio = (name: string, value: string, options: [string, string][], onChange: (v: string) => void) =>
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">{options.map(([v, l]) => <button type="button" role="radio" aria-checked={value === v} key={v} data-testid={`radio-${name}-${v}`} onClick={() => onChange(v)} className={`min-h-[42px] rounded-lg border px-4 text-sm font-semibold ${value === v ? 'border-[#1769d1] bg-[#eaf4ff] text-[#0c4a96]' : 'border-[#c9d7e3] bg-white text-[#2b4159] hover:bg-[#f4f9fc]'}`}>{l}</button>)}</div>;

  return <div className="min-h-[100dvh] bg-[#eef5fa] text-[#14253a]">
    <header className="border-b border-[#d2e0ea] bg-[#f9fcfe]"><div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4"><Link href="/" data-testid="link-simulator-home" className="text-sm font-extrabold">gustafta <span className="mono text-[10px] font-normal uppercase tracking-widest text-[#56718a]">SBU Simulator</span></Link><Link href="/dashboard" data-testid="link-simulator-workspace" className="text-sm font-bold text-[#1769d1]">Ruang kerja</Link></div></header>
    <main className="mx-auto max-w-4xl px-5 py-8 md:py-10">
      <div className="eyebrow mb-2 text-[#1769d1]">SIMULATOR / LATIHAN DEKLARASI</div>
      <p role="note" data-testid="text-simulator-privacy" className="mb-6 rounded-xl border border-[#b9d5e9] bg-[#dff0fc] p-4 text-sm leading-6 text-[#173d5d]">Data hanya ada di memori browser ini. Tidak diunggah, tidak dikirim ke AI atau server, dan tidak disimpan. Memuat ulang atau meninggalkan halaman menghapus semua isian. Simulator tidak membaca atau menganalisis berkas apa pun; semua hasil berasal dari isian Anda. {SIMULATOR_LIMITATION}</p>

      <nav aria-label="Langkah simulator"><ol className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">{STEPS.map((s, i) => <li key={s}><button type="button" data-testid={`button-step-${i + 1}`} disabled={i > step} style={{ opacity: 1 }} aria-current={i === step ? 'step' : undefined} onClick={() => goStep(i)} className={`h-full w-full rounded-lg border px-3 py-3 text-left text-xs font-bold leading-4 ${i === step ? 'border-[#1769d1] bg-[#1769d1] text-white' : i < step ? 'border-[#9fc3e6] bg-white text-[#175eae]' : 'border-[#d1dfe9] bg-[#f4f8fb] text-[#526b81]'}`}><span className="mono block">0{i + 1}</span><span className="block">{s}</span></button></li>)}</ol></nav>

      <section className="surface p-5 sm:p-8" aria-labelledby="step-heading">
        <h1 id="step-heading" ref={headingRef} tabIndex={-1} className="display text-2xl font-extrabold outline-none sm:text-3xl">{`Langkah ${step + 1} dari 4: ${STEPS[step]}`}</h1>
        {isExample && <p data-testid="badge-example" className="mt-3 inline-block rounded-md bg-[#fdf1e3] px-3 py-1 text-xs font-bold text-[#8a4b0b]">DATA CONTOH - bukan kasus nyata</p>}

        {showErrs && <div role="alert" data-testid="text-step-errors" className="mt-5 rounded-lg border border-[#e3b3b2] bg-[#fbe9e8] p-4 text-sm text-[#7d2927]"><p className="font-bold">Lengkapi dulu:</p><ul className="mt-1 list-disc pl-5">{errs.map(e => <li key={e}>{e}</li>)}</ul></div>}

        {step === 0 && <div className="mt-6 space-y-5">
          <div><div className="mb-1.5 text-xs font-bold text-[#2b4159]">Jenis permohonan</div>{radio('jenis-permohonan', draft.requestType, [['baru', 'Baru'], ['perpanjangan', 'Perpanjangan']], v => set('requestType', v as SimulatorDraft['requestType']))}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Fld id="sim-company" label="Nama badan usaha atau perusahaan simulasi"><input id="sim-company" data-testid="input-sim-company" className="field" value={draft.companyName} onChange={e => set('companyName', e.target.value)} /></Fld>
            <Fld id="sim-type" label="Jenis badan usaha"><input id="sim-type" data-testid="input-sim-type" className="field" value={draft.businessType} onChange={e => set('businessType', e.target.value)} /></Fld>
            <Fld id="sim-sub" label="Subklasifikasi" hint="Bukan kode KBLI."><input id="sim-sub" data-testid="input-sim-sub" className="field" value={draft.subclassification} onChange={e => set('subclassification', e.target.value)} /></Fld>
            <Fld id="sim-qual" label="Kualifikasi" hint="Sesuai dokumen atau skenario, bukan perkiraan."><input id="sim-qual" data-testid="input-sim-qual" className="field" value={draft.qualification} onChange={e => set('qualification', e.target.value)} /></Fld>
          </div>
          {draft.requestType === 'baru' ? <div><div className="mb-1.5 text-xs font-bold text-[#2b4159]">Apakah ini SBU pertama badan usaha?</div>{radio('sbu-pertama', draft.firstSbu, [['belum_diketahui', 'Belum diketahui'], ['ya', 'Ya'], ['tidak', 'Tidak']], v => set('firstSbu', v as SimulatorDraft['firstSbu']))}</div>
            : <div className="grid gap-4 sm:grid-cols-2"><Fld id="sim-old" label="Nomor SBU sebelumnya"><input id="sim-old" data-testid="input-sim-old-number" className="field" value={draft.existingNumber} onChange={e => set('existingNumber', e.target.value)} /></Fld><Fld id="sim-exp" label="Tanggal masa berlaku SBU sebelumnya"><input id="sim-exp" type="date" data-testid="input-sim-old-date" className="field" value={draft.existingExpiresOn} onChange={e => set('existingExpiresOn', e.target.value)} /></Fld></div>}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#e0e9f0] pt-4"><button type="button" data-testid="button-load-example" onClick={loadExample} className="btn btn-outline">Muat DATA CONTOH</button><span className="text-xs text-[#688096]">Contoh sintetis; menimpa isian saat ini.</span></div>
        </div>}

        {step === 1 && <div className="mt-6 space-y-5"><p className="text-sm leading-6 text-[#526b81]">Catat kondisi bahan Anda. Referensi hanyalah teks yang Anda ketik; tidak ada berkas yang diunggah atau diperiksa.</p>
          {areas.map(a => { const doc = draft.documents[a.id]; return <fieldset key={a.id} data-testid={`group-area-${a.id}`} className="min-w-0 rounded-xl border border-[#d1dfe9] p-4"><legend className="px-1 text-sm font-bold">{a.label}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Fld id={`st-${a.id}`} label="Status"><select id={`st-${a.id}`} data-testid={`select-status-${a.id}`} className="field" value={doc.status} onChange={e => setDoc(a.id, { status: e.target.value as SimulatorDocumentStatus })}>{STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Fld>
              <Fld id={`rf-${a.id}`} label="Nama atau nomor referensi"><input id={`rf-${a.id}`} data-testid={`input-ref-${a.id}`} className="field" value={doc.reference} onChange={e => setDoc(a.id, { reference: e.target.value })} /></Fld>
              <Fld id={`nm-${a.id}`} label="Nama badan usaha pada bahan" hint="Opsional; dibandingkan dengan profil."><input id={`nm-${a.id}`} data-testid={`input-name-${a.id}`} className="field" value={doc.companyName} onChange={e => setDoc(a.id, { companyName: e.target.value })} /></Fld>
              <Fld id={`nt-${a.id}`} label={doc.status === 'tidak_relevan' ? 'Alasan tidak relevan (wajib)' : 'Catatan'} hint={doc.status === 'tidak_relevan' ? 'Pilihan ini bukan pembebasan syarat dan memerlukan tinjauan manusia.' : undefined}><textarea id={`nt-${a.id}`} data-testid={`input-note-${a.id}`} rows={2} className="field" aria-required={doc.status === 'tidak_relevan'} aria-invalid={attempted[1] && doc.status === 'tidak_relevan' && !doc.note.trim() ? true : undefined} value={doc.note} onChange={e => setDoc(a.id, { note: e.target.value })} /></Fld>
            </div></fieldset>; })}</div>}

        {step === 2 && <div className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2"><Fld id="sim-contract" label="Referensi kontrak"><input id="sim-contract" data-testid="input-sim-contract" className="field" value={draft.contractReference} onChange={e => set('contractReference', e.target.value)} /></Fld><Fld id="sim-alloc" label="Alokasi pengalaman" hint="Porsi, major item, atau RAB yang relevan."><input id="sim-alloc" data-testid="input-sim-alloc" className="field" value={draft.allocation} onChange={e => set('allocation', e.target.value)} /></Fld></div>
          <div><div className="mb-1.5 text-xs font-bold text-[#2b4159]">Apakah pengalaman ini pernah digunakan untuk bagian atau permohonan lain?</div>{radio('pengalaman-ulang', draft.reusedExperience, [['belum_diketahui', 'Belum diketahui'], ['ya', 'Ya'], ['tidak', 'Tidak']], v => set('reusedExperience', v as SimulatorDraft['reusedExperience']))}</div>
          <label className="flex items-start gap-3 rounded-xl border border-[#b9d5e9] bg-[#f3f9fe] p-4 text-sm leading-6"><input type="checkbox" data-testid="checkbox-acknowledge" className="mt-1 h-5 w-5 shrink-0" checked={draft.acknowledge} onChange={e => set('acknowledge', e.target.checked)} /><span>Saya memahami bahwa hasil hanya cerminan isian saya. Simulator ini bukan verifikasi berkas, bukan sertifikasi, dan bukan keputusan LSBU/OSS.</span></label>
        </div>}

        {step === 3 && <div className="mt-6 space-y-6">
          {profileErrors.length > 0 && <p role="alert" className="rounded-lg bg-[#fdf1e3] p-3 text-sm text-[#8a4b0b]">Profil belum lengkap; kembali ke langkah 1 untuk melengkapi.</p>}
          <div className="rounded-xl bg-[#142c46] p-5 text-white sm:p-6">
            <div className="eyebrow text-[#8ec7f4]">STATUS ISIAN</div>
            <p data-testid="text-result-status" className="display mt-2 text-xl font-extrabold sm:text-2xl">{result.status}</p>
            <div className="mt-5"><div className="flex justify-between text-xs text-[#bad0e2]"><span>Cakupan penandaan area</span><span data-testid="text-coverage" className="mono">{result.reviewed} dari {result.totalAreas} area ({result.coverage}%)</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#2b435b]" role="img" aria-label={`${result.reviewed} dari ${result.totalAreas} area sudah ditandai`}><div className="h-full origin-left bg-[#82c8ff]" style={{ width: `${result.coverage}%` }} /></div>
              <p className="mt-2 text-xs text-[#bad0e2]">Ini cakupan penandaan isian, bukan skor kelayakan atau peluang lolos.</p></div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center text-xs"><div className="rounded-lg bg-[#1f3b57] p-3"><dt>Belum lengkap</dt><dd data-testid="text-count-missing" className="display text-2xl font-extrabold">{result.missing}</dd></div><div className="rounded-lg bg-[#1f3b57] p-3"><dt>Perlu diperiksa</dt><dd data-testid="text-count-conflict" className="display text-2xl font-extrabold">{result.conflicts}</dd></div><div className="rounded-lg bg-[#1f3b57] p-3"><dt>Tinjauan manusia</dt><dd data-testid="text-count-review" className="display text-2xl font-extrabold">{result.reviews}</dd></div></dl>
          </div>
          <div><h2 className="display text-xl font-extrabold">Temuan dan tindak lanjut</h2><ul className="mt-3 space-y-3">{result.findings.map(f => <li key={f.id} data-testid={`finding-${f.id}`} className="rounded-xl border border-[#d1dfe9] p-4"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${SEV_CLASS[f.severity]}`}>{SEVERITY[f.severity]}</span><span className="text-xs text-[#688096]">{f.area}</span></div><h3 className="mt-2 break-words text-sm font-bold">{f.title}</h3><p className="mt-1 break-words text-sm leading-6 text-[#526b81]">{f.detail}</p><p className="mt-2 break-words text-sm leading-6"><span className="font-bold">Tindak lanjut:</span> {f.action}</p></li>)}</ul></div>
          <div className="flex flex-wrap gap-3"><button type="button" data-testid="button-download-report" onClick={download} className="btn btn-primary"><Download size={16} /> Unduh laporan teks</button><button type="button" data-testid="button-edit-answers" onClick={() => setStep(0)} className="btn btn-outline"><ArrowLeft size={16} /> Ubah isian</button><button type="button" data-testid="button-reset" onClick={() => setConfirmReset(true)} className="btn btn-outline"><RotateCcw size={16} /> Mulai ulang</button></div>
          {confirmReset && <div role="alertdialog" aria-labelledby="reset-title" data-testid="dialog-reset" className="rounded-xl border border-[#e3b3b2] bg-[#fbe9e8] p-4"><p id="reset-title" className="text-sm font-bold">Hapus semua isian dan mulai dari awal?</p><div className="mt-3 flex gap-3"><button type="button" data-testid="button-confirm-reset" onClick={reset} className="btn btn-dark">Ya, hapus</button><button type="button" data-testid="button-cancel-reset" autoFocus onClick={() => setConfirmReset(false)} className="btn btn-outline">Batal</button></div></div>}
        </div>}

        <div className="mt-8 flex justify-between gap-3 border-t border-[#e0e9f0] pt-5">
          <button type="button" data-testid="button-back" disabled={step === 0} onClick={() => setStep(step - 1)} className="btn btn-outline"><ArrowLeft size={16} /> Kembali</button>
          {step < 3 && <button type="button" data-testid="button-next" onClick={next} className="btn btn-primary">{step === 2 ? 'Lihat hasil' : 'Lanjut'} <ArrowRight size={16} /></button>}
        </div>
      </section>
    </main>
  </div>;
}
