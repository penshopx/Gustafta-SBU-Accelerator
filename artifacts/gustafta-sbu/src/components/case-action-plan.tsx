import React from 'react';
import type { Assessment } from '@workspace/api-client-react';
import { ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';

export function CaseActionPlan({ assessment, onRecord }: {
  assessment: Assessment;
  onRecord: (code: string) => void;
}) {
  const missing = assessment.findings.filter(finding =>
    finding.status === 'perlu_bukti' && !finding.code.startsWith('transisi'));
  const manual = assessment.findings.filter(finding =>
    finding.status === 'perlu_tinjauan' && !finding.code.startsWith('transisi'));
  const external = assessment.findings.filter(finding =>
    finding.code.startsWith('transisi') && finding.status === 'perlu_tinjauan');

  return <section aria-labelledby="action-plan-title" className="surface mb-6 overflow-hidden">
    <div className="border-b border-[#dbe8f1] bg-[#eaf5fd] p-5 sm:p-6">
      <div className="eyebrow text-[#1769d1]">LANGKAH BERIKUTNYA</div>
      <h2 id="action-plan-title" className="display mt-2 text-xl font-extrabold text-[#19324a]">Rencana aksi persiapan</h2>
      <p className="mt-2 text-sm leading-6 text-[#47667e]">Disusun dari penilaian awal kasus ini. Catatan bukti adalah deklarasi Anda, bukan verifikasi dokumen atau keputusan LSBU.</p>
    </div>
    <div className="space-y-5 p-5 sm:p-6">
      {missing.length > 0 ? <div>
        <h3 className="text-sm font-bold text-[#19324a]">{missing.length} kebutuhan belum dicatat</h3>
        <ol className="mt-3 space-y-3">
          {missing.map((finding, index) => <li key={finding.code} data-testid={`action-${finding.code}`} className="flex flex-col gap-3 rounded-xl border border-[#dbe8f1] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="text-sm font-bold text-[#19324a]">{index + 1}. {finding.title}</p><p className="mt-1 text-xs leading-5 text-[#56718a]">{finding.detail}</p></div>
            <button type="button" data-testid={`button-record-${finding.code}`} onClick={() => onRecord(finding.code === 'smap' ? '' : finding.code)} className="btn btn-outline shrink-0">Catat bukti <ArrowRight size={15}/></button>
          </li>)}
        </ol>
      </div> : <div data-testid="status-action-recorded" className="flex items-start gap-3 text-sm leading-6 text-[#236e5b]"><CheckCircle2 size={19} className="mt-0.5 shrink-0"/> Tidak ada kategori persiapan yang belum dicatat. Isi dan keaslian dokumen tetap perlu diperiksa secara manual.</div>}
      {manual.length > 0 && <div className="rounded-xl border border-[#efd9af] bg-[#fff8e9] p-4 text-sm text-[#775517]"><h3 className="font-bold">Perlu pemeriksaan manual</h3><ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5">{manual.map(finding => <li key={finding.code}>{finding.title}: {finding.detail}</li>)}</ul></div>}
      {external.length > 0 && <div data-testid="status-external-review" className="flex items-start gap-3 rounded-xl border border-[#dbe8f1] bg-[#f5f9fc] p-4 text-xs leading-6 text-[#526e85]"><ShieldAlert size={19} className="mt-0.5 shrink-0 text-[#1769d1]"/><p><strong className="text-[#19324a]">{external.length} alur transisi menunggu verifikasi sumber dan telaah ahli.</strong> Ini bukan bukti yang dapat dilengkapi pemohon melalui catatan. Tanggal dan tenggat tidak ditampilkan sebelum terverifikasi.</p></div>}
    </div>
  </section>;
}