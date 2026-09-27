import * as React from 'react';
import { ArrowUpRight, CircleAlert } from 'lucide-react';
import { getListRegulationsQueryKey, useListRegulations } from '@workspace/api-client-react';
import { TransitionExplainer } from './transition-explainer';

export function RegulationsPage() {
  const result = useListRegulations({ query: { queryKey: getListRegulationsQueryKey() } });
  return <>
    <div className="mb-8">
      <div className="eyebrow mb-2 text-[#1769d1]">PUSAT PENGETAHUAN / REGULASI</div>
      <h1 className="display text-[32px] font-extrabold leading-tight sm:text-[39px]">Rujukan regulasi</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#526b81]">Ringkasan praktis bersumber dari aturan primer. Buka dan telaah sumber aslinya untuk memastikan ketentuan terbaru.</p>
    </div>
    <div className="mb-7 rounded-2xl bg-[#17324d] p-6 text-white sm:p-8"><div className="flex gap-4"><CircleAlert size={23} className="shrink-0 text-[#9bd1f6]"/><div><div className="eyebrow text-[#9bd1f6]">CATATAN MASA TRANSISI</div><h2 className="display mt-2 text-xl font-extrabold">Periksa tanggal berlaku dan aturan pelaksana.</h2><p className="mt-2 max-w-3xl text-sm leading-7 text-[#c6dbe9]">Ketentuan SBU dapat berubah melalui pembaruan aturan, masa transisi, serta penafsiran lembaga terkait. Ringkasan ini bukan nasihat hukum atau konfirmasi kelayakan. Bila ada perbedaan, dokumen resmi yang berlaku menjadi acuan.</p></div></div></div>
    <TransitionExplainer/>
    {result.isLoading ? <div aria-label="Memuat data" className="surface p-5">Memuat data regulasi...</div>
      : result.isError ? <div className="surface p-9 text-center"><h3 className="font-bold text-lg">Data belum dapat ditampilkan</h3><p className="mt-2 text-sm text-[#58708a]">Koneksi sedang terganggu. Coba muat ulang data.</p><button data-testid="button-retry" onClick={() => result.refetch()} className="btn btn-outline mt-5">Coba lagi</button></div>
      : result.data?.length ? <div className="grid gap-4 lg:grid-cols-2">{result.data.map((rule, i) => <article key={rule.id} className="surface p-6"><div className="flex items-start justify-between gap-3"><div className="eyebrow text-[#1769d1]">RUJUKAN {String(i+1).padStart(2,'0')}</div><span data-testid={`text-rule-status-${rule.id}`} className="rounded-full bg-[#e7f3fc] px-3 py-1 text-[10px] font-bold text-[#326384]">{rule.effectiveStatus}</span></div><h3 className="display mt-5 text-xl font-extrabold">{rule.title}</h3><p className="mt-3 text-sm leading-7 text-[#57728a]">{rule.detail}</p><div className="mt-6 border-t border-[#e1eaf0] pt-4 text-xs leading-6 text-[#42637e]"><span className="font-bold">Sumber primer: </span>{/^https?:\/\//.test(rule.source) ? <a data-testid={`link-source-${rule.id}`} href={rule.source} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-[#1769d1] underline underline-offset-2">{rule.source} <ArrowUpRight size={12} className="inline"/></a> : rule.source}</div></article>)}</div>
      : <div className="surface relative overflow-hidden px-7 py-12 text-center"><h3 className="display text-xl font-extrabold">Belum ada ringkasan regulasi</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#586f86]">Rujukan sedang tidak tersedia. Jangan gunakan ringkasan yang tidak dapat ditelusuri sebagai dasar keputusan.</p></div>}
  </>;
}