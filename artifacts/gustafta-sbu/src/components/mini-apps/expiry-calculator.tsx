import { useId, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { calculateExpiry, validCalendarDate } from '@/lib/sbu-mini-apps';

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const TONE = { expired: 'border-[#e3b3b2] bg-[#fbe9e8] text-[#7d2927]', today: 'border-[#ecc58f] bg-[#fdf1e3] text-[#7a420a]', upcoming: 'border-[#9fc3e6] bg-[#eaf4ff] text-[#0c4a96]' } as const;

export function ExpiryCalculator() {
  const id = useId();
  const [kind, setKind] = useState<'SBU' | 'SKK'>('SBU');
  const [expiresOn, setExpiresOn] = useState('');
  const [asOf, setAsOf] = useState(today);
  const [touched, setTouched] = useState(false);
  const expErr = touched && !validCalendarDate(expiresOn) ? 'Masukkan tanggal kalender yang valid (YYYY-MM-DD).' : '';
  const asOfErr = touched && !validCalendarDate(asOf) ? 'Masukkan tanggal acuan yang valid (YYYY-MM-DD).' : '';
  const result = validCalendarDate(expiresOn) && validCalendarDate(asOf) ? calculateExpiry(expiresOn, asOf) : null;
  const message = !result ? null : result.status === 'expired' ? `${kind} sudah lewat ${Math.abs(result.days)} hari kalender dari tanggal acuan.` : result.status === 'today' ? `Tanggal berakhir ${kind} sama dengan tanggal acuan.` : `${result.days} hari kalender lagi menuju tanggal berakhir ${kind}.`;
  const label = !result ? '' : result.status === 'expired' ? 'Lewat' : result.status === 'today' ? 'Hari ini' : 'Mendatang';

  return <section id="kalkulator-masa-berlaku" aria-labelledby={`${id}-h`} data-testid="tool-expiry" className="surface scroll-mt-6 p-5 sm:p-7">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#142c46] text-[#8ec7f4]"><CalendarClock size={19} /></span><div><div className="eyebrow text-[#1769d1]">ALAT 01 / LOKAL</div><h2 id={`${id}-h`} className="display text-xl font-extrabold">Hitung sisa masa berlaku SBU/SKK</h2></div></div>
    <p className="mt-3 text-sm leading-6 text-[#526b81]">Selisih hari kalender antara tanggal acuan dan tanggal berakhir yang Anda ketik. Bukan penentu durasi menurut aturan dan bukan verifikasi keaslian sertifikat.</p>
    <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); setTouched(true); }} noValidate>
      <div><span className="mb-1.5 block text-xs font-bold text-[#2b4159]" id={`${id}-k`}>Jenis</span><div role="radiogroup" aria-labelledby={`${id}-k`} className="grid grid-cols-2 gap-1 rounded-[10px] border border-[#bfcedc] bg-[#f4f8fb] p-1">{(['SBU', 'SKK'] as const).map(k => <button type="button" role="radio" aria-checked={kind === k} key={k} data-testid={`radio-expiry-${k.toLowerCase()}`} onClick={() => setKind(k)} className={`min-h-[36px] rounded-md text-sm font-bold transition-colors ${kind === k ? 'bg-[#14253a] text-white' : 'text-[#2b4159] hover:bg-white'}`}>{k}</button>)}</div></div>
      <div><label htmlFor={`${id}-e`} className="mb-1.5 block text-xs font-bold text-[#2b4159]">Tanggal berakhir</label><input id={`${id}-e`} data-testid="input-expiry-date" type="date" className="field" value={expiresOn} onChange={e => setExpiresOn(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={!!expErr || undefined} aria-describedby={expErr ? `${id}-ee` : undefined} />{expErr && <p id={`${id}-ee`} className="mt-1 text-xs font-semibold text-[#9a3432]">{expErr}</p>}</div>
      <div><label htmlFor={`${id}-a`} className="mb-1.5 block text-xs font-bold text-[#2b4159]">Tanggal acuan</label><input id={`${id}-a`} data-testid="input-expiry-asof" type="date" className="field" value={asOf} onChange={e => setAsOf(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={!!asOfErr || undefined} aria-describedby={asOfErr ? `${id}-ae` : `${id}-ah`} />{asOfErr ? <p id={`${id}-ae`} className="mt-1 text-xs font-semibold text-[#9a3432]">{asOfErr}</p> : <p id={`${id}-ah`} className="mt-1 text-xs text-[#688096]">Ubah sesuai tanggal yang ingin Anda periksa.</p>}</div>
    </form>
    <div role="status" aria-live="polite" data-testid="text-expiry-result" className="mt-5">
      {result && message ? <div className={`fade-up flex flex-wrap items-center gap-4 rounded-xl border p-4 ${TONE[result.status]}`}><span className="display text-4xl font-extrabold tabular-nums">{Math.abs(result.days)}</span><div><span className="eyebrow">{label} / hari kalender</span><p className="text-sm font-semibold leading-6">{message}</p></div></div>
        : <p className="rounded-xl border border-dashed border-[#bfcedc] p-4 text-sm text-[#526b81]">Isi tanggal berakhir untuk melihat hasil.</p>}
    </div>
  </section>;
}
