import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, PencilLine, ShieldCheck } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import {
  APPLICATION_TYPES, HELP_AREAS, SERVICE_LIMITS, SERVICE_WHATSAPP_DISPLAY, buildServiceRequestMessage, buildWhatsAppUrl,
  emptyServiceRequest, validateServiceRequest, type HelpArea, type ServiceRequestDraft, type ServiceRequestErrors, type ServiceRequestField,
} from '@/lib/service-request';

const ORDER: ServiceRequestField[] = ['name', 'company', 'phone', 'location', 'applicationType', 'help', 'classification', 'notes', 'consent'];
const LABEL: Record<ServiceRequestField, string> = { name: 'Nama kontak', company: 'Badan usaha', phone: 'WhatsApp', location: 'Kota/provinsi', applicationType: 'Jenis permohonan', help: 'Bantuan', classification: 'Subklasifikasi', notes: 'Catatan', consent: 'Persetujuan' };
const fid = (f: ServiceRequestField) => `sr-${f}`;

export function ServiceRequestForm() {
  const [draft, setDraft] = useState<ServiceRequestDraft>(emptyServiceRequest);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<ServiceRequestErrors>({});
  const [stage, setStage] = useState<'edit' | 'review'>('edit');
  const [focusTarget, setFocusTarget] = useState<'errors' | 'review' | 'form' | null>(null);
  const errRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusTarget === 'errors') errRef.current?.focus();
    if (focusTarget === 'review') reviewRef.current?.focus();
    if (focusTarget === 'form') nameRef.current?.focus();
    if (focusTarget) setFocusTarget(null);
  }, [focusTarget]);

  const set = <K extends keyof ServiceRequestDraft>(k: K, v: ServiceRequestDraft[K]) => {
    setDraft(d => ({ ...d, [k]: v }));
    if (errors[k]) setErrors(e => { const n = { ...e }; delete n[k]; return n; });
  };
  const toggleHelp = (h: HelpArea) => set('help', draft.help.includes(h) ? draft.help.filter(x => x !== h) : [...draft.help, h]);

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validateServiceRequest(draft, consent);
    setErrors(e);
    if (Object.keys(e).length) { setFocusTarget('errors'); return; }
    setStage('review'); setFocusTarget('review');
    trackEvent('service_request_reviewed');
  };

  const errList = ORDER.filter(f => errors[f]);
  const described = (f: ServiceRequestField, hint?: string) => [hint, errors[f] ? `${fid(f)}-err` : ''].filter(Boolean).join(' ') || undefined;
  const Err = ({ f }: { f: ServiceRequestField }) => errors[f] ? <p id={`${fid(f)}-err`} data-testid={`error-${f}`} className="sr-err">{errors[f]}</p> : null;

  if (stage === 'review') {
    const message = buildServiceRequestMessage(draft);
    const href = buildWhatsAppUrl(message);
    return <div className="sr-panel" data-testid="panel-service-review">
      <h3 ref={reviewRef} tabIndex={-1} className="display text-2xl font-extrabold text-[var(--lp-text)] outline-none">Tinjau pesan sebelum dibuka di WhatsApp</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--lp-t2)]">Belum ada yang terkirim atau tersimpan. Pesan di bawah baru keluar dari halaman ini bila Anda menekan tautan, lalu Anda sendiri yang menekan kirim di WhatsApp ke <strong className="text-[var(--lp-text)]">{SERVICE_WHATSAPP_DISPLAY}</strong>.</p>
      <pre data-testid="text-service-summary" className="sr-summary">{message}</pre>
      <div className="mt-6 flex flex-wrap gap-3">
        <a data-testid="link-open-whatsapp" href={href} target="_blank" rel="noopener noreferrer"
          onClick={() => trackEvent('service_whatsapp_clicked')}
          onAuxClick={event => { if (event.button === 1) trackEvent('service_whatsapp_clicked'); }}
          className="lp-btn lp-btn-blue">Buka WhatsApp <ArrowUpRight size={16} /><span className="sr-only">dengan pesan ini (tab baru)</span></a>
        <button type="button" data-testid="button-edit-service" onClick={() => { setStage('edit'); setFocusTarget('form'); }} className="lp-btn lp-btn-ghost"><PencilLine size={16} /> Ubah isian</button>
      </div>
    </div>;
  }

  return <form noValidate={false} onSubmit={onSubmit} className="sr-panel" data-testid="form-service-request" aria-labelledby="service-form-title">
    <h3 id="service-form-title" className="display text-2xl font-extrabold text-[var(--lp-text)]">Isi kebutuhan Anda</h3>
    <p className="mt-1 text-sm text-[var(--lp-t3)]">Kolom bertanda * wajib. Jangan cantumkan NIK, NPWP, kata sandi, atau alamat lengkap.</p>
    {errList.length > 0 && <div ref={errRef} tabIndex={-1} role="alert" data-testid="summary-service-errors" className="sr-alert">
      <strong>Periksa {errList.length} isian:</strong>
      <ul className="mt-1 list-disc pl-5">{errList.map(f => <li key={f}><a href={`#${fid(f)}`} onClick={ev => { ev.preventDefault(); (document.getElementById(fid(f)) as HTMLElement | null)?.focus(); }}>{LABEL[f]}: {errors[f]}</a></li>)}</ul>
    </div>}
    <div className="mt-6 grid gap-5 sm:grid-cols-2">
      {([['name', 'Nama kontak', SERVICE_LIMITS.name, 'name'], ['company', 'Nama badan usaha', SERVICE_LIMITS.company, 'organization'], ['phone', 'Nomor WhatsApp', SERVICE_LIMITS.phone, 'tel'], ['location', 'Kota / provinsi', SERVICE_LIMITS.location, 'address-level2']] as const).map(([k, label, max, ac]) =>
        <div key={k}><label htmlFor={fid(k)} className="sr-label">{label} *</label>
          <input ref={k === 'name' ? nameRef : undefined} id={fid(k)} data-testid={`input-${k}`} required maxLength={max} autoComplete={ac} type={k === 'phone' ? 'tel' : 'text'} inputMode={k === 'phone' ? 'tel' : undefined}
            placeholder={k === 'phone' ? '0812-3456-7890' : undefined} value={draft[k]} onChange={e => set(k, e.target.value)} aria-invalid={!!errors[k]} aria-describedby={described(k)} className="sr-input" />
          <Err f={k} /></div>)}
    </div>
    <fieldset className="mt-6" aria-describedby={described('applicationType')}><legend className="sr-label">Jenis permohonan *</legend>
      <div className="flex flex-wrap gap-2">{APPLICATION_TYPES.map((a, i) => <label key={a.value} className="sr-chip">
        <input id={i === 0 ? fid('applicationType') : undefined} type="radio" name="sr-app" required value={a.value} data-testid={`radio-app-${a.value}`} checked={draft.applicationType === a.value} onChange={() => set('applicationType', a.value)} /><span>{a.label}</span></label>)}</div>
      <Err f="applicationType" /></fieldset>
    <fieldset className="mt-6" aria-describedby={described('help')}><legend className="sr-label">Bantuan yang dibutuhkan * <span className="font-normal text-[var(--lp-t3)]">(boleh lebih dari satu)</span></legend>
      <div className="grid gap-2 sm:grid-cols-2">{HELP_AREAS.map((h, i) => <label key={h.value} className="sr-option">
        <input id={i === 0 ? fid('help') : undefined} type="checkbox" data-testid={`check-help-${h.value}`} checked={draft.help.includes(h.value)} onChange={() => toggleHelp(h.value)} />
        <span><span className="block text-sm font-bold text-[var(--lp-text)]">{h.label}</span><span className="block text-xs text-[var(--lp-t3)]">{h.hint}</span></span></label>)}</div>
      <Err f="help" /></fieldset>
    <div className="mt-6"><label htmlFor={fid('classification')} className="sr-label">Subklasifikasi yang dituju <span className="font-normal text-[var(--lp-t3)]">(opsional)</span></label>
      <input id={fid('classification')} data-testid="input-classification" maxLength={SERVICE_LIMITS.classification} value={draft.classification} onChange={e => set('classification', e.target.value)} aria-invalid={!!errors.classification} aria-describedby={described('classification')} className="sr-input" placeholder="Kode atau nama, jika sudah diketahui" /><Err f="classification" /></div>
    <div className="mt-6"><label htmlFor={fid('notes')} className="sr-label">Catatan <span className="font-normal text-[var(--lp-t3)]">(opsional)</span></label>
      <textarea id={fid('notes')} data-testid="input-notes" rows={4} maxLength={SERVICE_LIMITS.notes} value={draft.notes} onChange={e => set('notes', e.target.value)} aria-invalid={!!errors.notes} aria-describedby={described('notes', 'sr-notes-count')} className="sr-input" />
      <p id="sr-notes-count" aria-live="polite" className="mt-1 text-right font-mono text-[11px] text-[var(--lp-t3)]">{draft.notes.length > 0 ? `Sisa ${SERVICE_LIMITS.notes - draft.notes.length} karakter` : 'Singkat saja, cukup untuk konteks awal'}</p><Err f="notes" /></div>
    <label className="sr-consent mt-6">
      <input id={fid('consent')} type="checkbox" required data-testid="check-consent" checked={consent} onChange={e => { setConsent(e.target.checked); if (errors.consent) setErrors(x => { const n = { ...x }; delete n.consent; return n; }); }} aria-invalid={!!errors.consent} aria-describedby={described('consent')} />
      <span>Saya setuju isian yang saya pilih dikirim lewat WhatsApp (layanan Meta) kepada pengelola Gustafta di {SERVICE_WHATSAPP_DISPLAY} untuk menanggapi permintaan ini. Saya paham ini bukan permohonan resmi otomatis, belum menimbulkan biaya atau pembayaran, dan tidak menjamin SBU terbit. *</span>
    </label>
    <Err f="consent" />
    <div className="mt-7 flex flex-wrap items-center gap-4">
      <button type="submit" data-testid="button-review-service" className="lp-btn lp-btn-blue">Tinjau pesan</button>
      <span className="flex items-center gap-2 text-xs text-[var(--lp-t3)]"><ShieldCheck size={15} className="shrink-0 text-[var(--lp-blue-text)]" />Tidak disimpan di server atau penyimpanan browser.</span>
    </div>
  </form>;
}
