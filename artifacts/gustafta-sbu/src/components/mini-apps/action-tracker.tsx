import { forwardRef, useId, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import { Check, Download, ListChecks, Pencil, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { actionReport, validCalendarDate, type ActionItem } from '@/lib/sbu-mini-apps';
import { actionKey, type BackupAction } from '@/lib/action-backup';
import { ActionBackup } from './action-backup';
import { downloadText } from '@/lib/local-download';
export { downloadText } from '@/lib/local-download';

type Draft = { title: string; responsible: string; dueOn: string };
const empty: Draft = { title: '', responsible: '', dueOn: '' };

export type ActionTrackerHandle = { appendTitles: (titles: string[]) => number };

export const ActionTracker = forwardRef<ActionTrackerHandle>(function ActionTracker(_, ref) {
  const id = useId();
  const [rows, setRows] = useState<ActionItem[]>([]);
  const [form, setForm] = useState<Draft>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const seq = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({
    appendTitles(titles) {
      const known = new Set(rows.map(row => row.title));
      const additions: ActionItem[] = [];
      for (const title of titles) {
        if (known.has(title)) continue;
        known.add(title);
        additions.push({ id: `a${++seq.current}`, title, responsible: '', dueOn: '', status: 'open' });
      }
      if (additions.length) setRows(previous => [...previous, ...additions]);
      setNotice(additions.length ? `${additions.length} tindakan pemeriksaan ditambahkan. Tentukan penanggung jawab dan tenggat sendiri.` : 'Tindakan yang sama sudah ada; tidak ditambahkan ulang.');
      return additions.length;
    },
  }), [rows]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!form.title.trim()) errs.title = 'Judul tindakan wajib diisi.';
    if (form.dueOn && !validCalendarDate(form.dueOn)) errs.dueOn = 'Tanggal tidak valid (YYYY-MM-DD).';
    setErrors(errs);
    if (Object.keys(errs).length) { titleRef.current?.focus(); return; }
    const data = { title: form.title.trim(), responsible: form.responsible.trim(), dueOn: form.dueOn };
    if (editing) { setRows(r => r.map(x => x.id === editing ? { ...x, ...data } : x)); setNotice('Tindakan diperbarui.'); }
    else { seq.current += 1; setRows(r => [...r, { id: `a${seq.current}`, status: 'open', ...data }]); setNotice('Tindakan ditambahkan.'); }
    setForm(empty); setEditing(null); titleRef.current?.focus();
  };
  const edit = (row: ActionItem) => { setEditing(row.id); setForm({ title: row.title, responsible: row.responsible, dueOn: row.dueOn }); setErrors({}); titleRef.current?.focus(); };
  const toggle = (row: ActionItem) => { setRows(r => r.map(x => x.id === row.id ? { ...x, status: x.status === 'done' ? 'open' : 'done' } : x)); setNotice(row.status === 'done' ? 'Tindakan dibuka kembali.' : 'Tindakan ditandai selesai.'); };
  const remove = (rid: string) => { setRows(r => r.filter(x => x.id !== rid)); if (editing === rid) { setEditing(null); setForm(empty); } setConfirmDelete(null); setNotice('Tindakan dihapus.'); };
  const done = rows.filter(r => r.status === 'done').length;
  const restore = (items: BackupAction[]) => {
    const known = new Set(rows.map(actionKey));
    const additions: ActionItem[] = [];
    for (const item of items) {
      const key = actionKey(item);
      if (known.has(key)) continue;
      known.add(key);
      additions.push({ ...item, id: `a${++seq.current}` });
    }
    setRows(previous => [...previous, ...additions]);
    return additions.length;
  };

  return <section id="pelacak-tindakan" aria-labelledby={`${id}-h`} data-testid="tool-tracker" className="surface scroll-mt-6 p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#142c46] text-[#8ec7f4]"><ListChecks size={19} /></span><div><div className="eyebrow text-[#1769d1]">ALAT 02 / DRAF SEMENTARA</div><h2 id={`${id}-h`} className="display text-xl font-extrabold">Pelacak tindakan manual</h2></div></div>
      {rows.length > 0 && <span data-testid="text-tracker-progress" className="mono rounded-md bg-[#eaf4ff] px-2.5 py-1 text-xs font-bold text-[#0c4a96]">{done}/{rows.length} selesai</span>}</div>
    <p role="note" data-testid="text-tracker-warning" className="mt-4 flex gap-2.5 rounded-xl border border-[#ecc58f] bg-[#fdf1e3] p-3.5 text-sm leading-6 text-[#6b3a08]"><TriangleAlert size={17} className="mt-0.5 shrink-0" /><span><b>Draf tidak disimpan.</b> Isian hilang bila Anda pindah halaman, menutup tab, atau memuat ulang. Tidak dikirim ke server, cloud, atau AI. Unduh laporan teks untuk menyimpannya.</span></p>

    <form onSubmit={submit} noValidate className="mt-5 grid gap-3 sm:grid-cols-[1.5fr_1fr_.9fr_auto] sm:items-start">
      <div><label htmlFor={`${id}-t`} className="mb-1.5 block text-xs font-bold text-[#2b4159]">Tindakan</label><input ref={titleRef} id={`${id}-t`} data-testid="input-action-title" className="field" maxLength={200} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} aria-invalid={!!errors.title || undefined} aria-describedby={errors.title ? `${id}-te` : undefined} placeholder="Mis. lengkapi laporan keuangan" />{errors.title && <p id={`${id}-te`} className="mt-1 text-xs font-semibold text-[#9a3432]">{errors.title}</p>}</div>
      <div><label htmlFor={`${id}-r`} className="mb-1.5 block text-xs font-bold text-[#2b4159]">Penanggung jawab</label><input id={`${id}-r`} data-testid="input-action-responsible" className="field" maxLength={120} value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} placeholder="Opsional" /></div>
      <div><label htmlFor={`${id}-d`} className="mb-1.5 block text-xs font-bold text-[#2b4159]">Tenggat</label><input id={`${id}-d`} type="date" data-testid="input-action-due" className="field" value={form.dueOn} onChange={e => setForm(f => ({ ...f, dueOn: e.target.value }))} aria-invalid={!!errors.dueOn || undefined} aria-describedby={errors.dueOn ? `${id}-de` : undefined} />{errors.dueOn && <p id={`${id}-de`} className="mt-1 text-xs font-semibold text-[#9a3432]">{errors.dueOn}</p>}</div>
      <div className="flex gap-2 sm:pt-[22px]"><button data-testid="button-save-action" className="btn btn-primary w-full sm:w-auto">{editing ? <><Check size={15} /> Simpan</> : <><Plus size={15} /> Tambah</>}</button>{editing && <button type="button" data-testid="button-cancel-edit" onClick={() => { setEditing(null); setForm(empty); setErrors({}); }} className="btn btn-outline">Batal</button>}</div>
    </form>
    <p className="sr-only" role="status" aria-live="polite">{notice}</p>

    {rows.length === 0 ? <div data-testid="empty-tracker" className="mt-5 rounded-xl border border-dashed border-[#bfcedc] p-6 text-center"><p className="text-sm font-bold">Belum ada tindakan.</p><p className="mt-1 text-xs text-[#688096]">Tambahkan langkah persiapan pertama di atas.</p></div>
      : <ul className="mt-5 divide-y divide-[#e0e9f0] overflow-hidden rounded-xl border border-[#d1dfe9]">{rows.map(row => <li key={row.id} data-testid={`row-action-${row.id}`} className={`p-3.5 transition-colors ${editing === row.id ? 'bg-[#eaf4ff]' : row.status === 'done' ? 'bg-[#f4f8fb]' : 'bg-white'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" data-testid={`button-toggle-${row.id}`} onClick={() => toggle(row)} aria-pressed={row.status === 'done'} aria-label={`${row.status === 'done' ? 'Buka kembali' : 'Tandai selesai'}: ${row.title}`} className={`grid h-7 w-7 shrink-0 place-items-center rounded-md border-2 transition-colors ${row.status === 'done' ? 'border-[#19745f] bg-[#19745f] text-white' : 'border-[#8fa6ba] bg-white hover:border-[#1769d1]'}`}>{row.status === 'done' && <Check size={15} />}</button>
          <div className="min-w-0 flex-1"><p className={`break-words text-sm font-bold ${row.status === 'done' ? 'text-[#5d7388] line-through' : ''}`}>{row.title}</p><p className="text-xs text-[#526b81]">{row.responsible || 'Tanpa penanggung jawab'} <span aria-hidden>·</span> <span className="mono">{row.dueOn || 'tanpa tenggat'}</span></p></div>
          <div className="flex gap-1"><button type="button" data-testid={`button-edit-${row.id}`} onClick={() => edit(row)} aria-label={`Ubah: ${row.title}`} className="rounded-lg p-2 text-[#2b4159] hover:bg-[#e3eef7]"><Pencil size={15} /></button><button type="button" data-testid={`button-delete-${row.id}`} onClick={() => setConfirmDelete(row.id)} aria-label={`Hapus: ${row.title}`} className="rounded-lg p-2 text-[#9a3432] hover:bg-[#fbe9e8]"><Trash2 size={15} /></button></div>
        </div>
        {confirmDelete === row.id && <div role="alertdialog" aria-label="Konfirmasi hapus" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#fbe9e8] p-3 text-sm text-[#7d2927]"><span className="font-semibold">Hapus tindakan ini?</span><button type="button" autoFocus data-testid={`button-confirm-delete-${row.id}`} onClick={() => remove(row.id)} className="btn btn-dark !min-h-[34px]">Hapus</button><button type="button" onClick={() => setConfirmDelete(null)} className="btn btn-outline !min-h-[34px]">Batal</button></div>}
      </li>)}</ul>}

    <div className="mt-5 flex flex-wrap gap-2"><button type="button" data-testid="button-download-actions" disabled={!rows.length} onClick={() => downloadText(actionReport(rows), 'rencana-tindakan-sbu.txt')} className="btn btn-dark"><Download size={15} /> Unduh laporan teks</button>{rows.length > 0 && <button type="button" data-testid="button-clear-actions" onClick={() => { setRows([]); setEditing(null); setForm(empty); setNotice('Semua tindakan dihapus.'); }} className="btn btn-outline"><RotateCcw size={15} /> Kosongkan</button>}</div>
    <ActionBackup rows={rows} onRestore={restore} />
  </section>;
});
