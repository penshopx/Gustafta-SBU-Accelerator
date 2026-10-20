import React, { useEffect, useRef, useState } from 'react';
import { getPreparationSummary } from '@workspace/api-client-react';
import { Download, Printer } from 'lucide-react';
import { useFormMutationOptions } from './account-queries';

export function CasePreparationExport({ caseId }: { caseId: number }) {
  const options = useFormMutationOptions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { abort.current?.abort(); cleanup.current?.(); }, [caseId]);

  async function exportSummary(mode: 'download' | 'print') {
    if (abort.current && !abort.current.signal.aborted) return;
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    setError('');
    cleanup.current?.();
    try {
      const html = await getPreparationSummary(caseId, {
        ...options.request, signal: controller.signal, cache: 'no-store', responseType: 'text',
      });
      // A previous account's pending response must not create a file or print surface.
      if (controller.signal.aborted) return;
      if (mode === 'download') {
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'ringkasan-persiapan-sbu.html';
        anchor.click();
        const timer = window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        cleanup.current = () => { window.clearTimeout(timer); URL.revokeObjectURL(url); };
      } else {
        const frame = document.createElement('iframe');
        frame.title = 'Ringkasan persiapan untuk dicetak';
        // The server escapes all text and emits a CSP forbidding scripts/network.
        // Do not sandbox this frame: Chromium can block its native print call.
        frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:0;border:0';
        let disposed = false;
        const dispose = () => {
          if (disposed) return;
          disposed = true;
          frame.onload = null;
          frame.contentWindow?.removeEventListener('afterprint', dispose);
          window.clearTimeout(timer);
          frame.remove();
          if (cleanup.current === dispose) cleanup.current = null;
        };
        const timer = window.setTimeout(dispose, 300_000);
        cleanup.current = dispose;
        frame.onload = () => {
          // A frame must never open a second dialog on a repeated load event.
          frame.onload = null;
          if (disposed || controller.signal.aborted) { dispose(); return; }
          try {
            if (!frame.contentWindow) throw new Error('Print window unavailable');
            frame.contentWindow.addEventListener('afterprint', dispose, { once: true });
            frame.contentWindow.focus();
            frame.contentWindow.print();
          } catch {
            dispose();
            setError('Cetak belum dapat dibuka. Unduh HTML, buka berkasnya, lalu pilih Cetak di browser.');
          }
        };
        frame.srcdoc = html;
        document.body.appendChild(frame);
      }
    } catch {
      if (!controller.signal.aborted) setError('Ringkasan terbaru tidak dapat dibuat. Periksa sesi Anda dan coba lagi. Tidak ada data lama yang diekspor.');
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        abort.current = null;
      }
    }
  }

  return <section aria-label="Ringkasan konsultasi" className="surface mb-6 p-5 sm:p-6">
    <h2 className="font-bold text-[#19324a]">Bawa persiapan ke konsultasi</h2>
    <p className="mt-2 text-sm leading-6 text-[#47667e]">Ringkasan kasus, kategori catatan bukti, personel dan SKK tertaut, temuan dan sumber aturan terbaru. Penugasan, jenjang, nomor SKK dan indikator tanggal disertakan sebagai deklarasi pengguna, bukan verifikasi keaslian SKK, kelayakan atau persetujuan sertifikasi oleh LSBU.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" className="btn btn-outline" data-testid="button-download-summary" disabled={pending} onClick={() => exportSummary('download')}><Download size={16}/> Unduh HTML</button>
      <button type="button" className="btn btn-primary" data-testid="button-print-summary" disabled={pending} onClick={() => exportSummary('print')}><Printer size={16}/> Cetak / Simpan PDF</button>
    </div>
    <p className="mt-3 text-xs leading-5 text-[#60788d]">{pending ? 'Membuat ringkasan dari data terbaru…' : 'Isi catatan pribadi tidak disertakan. Simpan unduhan secara privat; salinan tidak mengikuti perubahan berikutnya. Saat mencetak, gunakan pengaturan bawaan dan matikan header/footer browser bila perlu.'}</p>
    {error && <p role="alert" className="mt-3 text-sm text-[#b34442]">{error}</p>}
  </section>;
}
