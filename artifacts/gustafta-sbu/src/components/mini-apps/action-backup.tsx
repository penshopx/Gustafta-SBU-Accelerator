import { useEffect, useRef, useState } from 'react';
import { actionKey, MAX_BACKUP_BYTES, parseActionBackup, serializeActionBackup, type BackupAction } from '@/lib/action-backup';
import type { ActionItem } from '@/lib/sbu-mini-apps';
import { downloadText } from '@/lib/local-download';

export function ActionBackup({ rows, onRestore, onDownloadStarted }: { rows: ActionItem[]; onRestore: (items: BackupAction[]) => number; onDownloadStarted?: () => void }) {
  const [preview, setPreview] = useState<BackupAction[] | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const epoch = useRef(0);
  useEffect(() => () => { epoch.current++; }, []);
  const cancel = () => { epoch.current++; setPreview(null); setReading(false); setError(''); setNotice('Pemulihan dibatalkan; daftar tidak diubah.'); };
  const select = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    const request = ++epoch.current;
    setPreview(null); setError(''); setNotice('');
    if (!file) { setReading(false); return; }
    setReading(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Berkas terlalu besar. Maksimal 256 KiB.');
      const items = parseActionBackup(await file.text());
      if (request !== epoch.current) return;
      setPreview(items);
    } catch (failure) {
      if (request === epoch.current) setError(failure instanceof Error ? failure.message : 'Berkas tidak dapat dibaca.');
    } finally {
      if (request === epoch.current) setReading(false);
    }
  };
  const exportBackup = () => {
    setError('');
    try {
      downloadText(serializeActionBackup(rows), 'cadangan-tindakan-sbu.json', 'application/json;charset=utf-8');
      onDownloadStarted?.();
      setNotice('Unduhan cadangan dimulai. Simpan file di tempat yang aman.');
    } catch {
      setError('Cadangan tidak dapat dibuat. Batas cadangan 200 tindakan / 256 KiB. Laporan teks tetap tersedia.');
    }
  };
  const existing = new Set(rows.map(actionKey));
  const additions = preview ? new Set(preview.filter(row => !existing.has(actionKey(row))).map(actionKey)).size : 0;
  return <div className="mt-5 rounded-xl border border-[#d1dfe9] bg-[#f9fcfe] p-4">
    <h3 className="text-sm font-bold">Cadangan & pemulihan lokal</h3>
    <p className="mt-2 text-xs leading-5 text-[#526b81]">Unduh JSON untuk melanjutkan di sesi lain. File memuat seluruh judul, penanggung jawab, tenggat, dan status sesuai isian; tidak dienkripsi. Periksa data sensitif sebelum menyimpan atau membagikan. Pemulihan hanya membaca file di browser, tidak mengunggahnya. Maksimal 200 tindakan / 256 KiB.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" data-testid="button-backup-actions" className="btn btn-outline" disabled={!rows.length} onClick={exportBackup}>Unduh cadangan JSON</button>
      <label className="text-sm font-bold">Pilih cadangan JSON<input data-testid="input-backup-actions" className="mt-1 block max-w-full text-xs" type="file" accept=".json,application/json" onChange={event => { void select(event.currentTarget); }} /></label>
    </div>
    {reading && <div className="mt-3"><p role="status">Membaca cadangan lokal…</p><button type="button" className="btn btn-outline mt-2" onClick={cancel}>Batal</button></div>}
    {error && <p data-testid="error-backup" role="alert" className="mt-3 text-sm text-[#9a3432]">{error}</p>}
    {preview && <div data-testid="preview-backup" className="mt-3">
      <p className="text-sm font-bold">{preview.length} tindakan dalam cadangan; {additions} tindakan baru akan ditambahkan.</p>
      <p className="mt-1 text-xs leading-5 text-[#526b81]">Tidak menimpa daftar atau draf. Duplikat hanya dilewati jika judul, penanggung jawab, tenggat, dan status semuanya sama. Versi berbeda tetap ditambahkan untuk Anda telaah. Status selesai adalah deklarasi pengguna, bukan verifikasi.</p>
      <ul className="mt-2 max-h-60 overflow-auto text-sm">{preview.map((item, index) => <li key={index} className="border-b border-[#d1dfe9] py-2 break-words">{index + 1}. {item.title}<br /><span className="text-xs">{item.responsible || 'Belum ada penanggung jawab'} · {item.dueOn || 'Tanpa tenggat'} · {item.status === 'done' ? 'Selesai (deklarasi)' : 'Terbuka'}</span></li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" data-testid="button-restore-actions" disabled={!additions} className="btn btn-primary" onClick={() => { const count = onRestore(preview); setPreview(null); setNotice(`${count} tindakan dipulihkan; daftar lama tetap utuh.`); }}>Tambahkan ke pelacak</button>
        <button type="button" data-testid="button-cancel-restore" className="btn btn-outline" onClick={cancel}>Batal</button>
      </div>
    </div>}
    <p role="status" aria-live="polite" className="mt-2 text-xs text-[#526b81]">{notice}</p>
  </div>;
}
