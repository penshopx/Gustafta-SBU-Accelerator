import React from 'react';
import { Box, ShieldCheck } from 'lucide-react';
import { useGetWorkspace } from '@workspace/api-client-react';
import { useAccountReadOptions } from './account-queries';
import { ErrorState, Loading } from '@/components/request-states';
import type { Workspace } from '@workspace/api-client-react';


export function WorkspaceFoundationView({ workspace }: { workspace: Workspace }) {
  const def = workspace.clients.find(c => c.isDefault) ?? workspace.clients[0];
  return <div data-testid="workspace-foundation-ready" className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[#3b6ea5] bg-[#0f2036] p-4"><div className="eyebrow text-[#9fd0ff]">STATUS WADAH</div><div data-testid="text-container-status" className="mt-2 text-sm font-bold text-white">{def ? 'Wadah kasus pribadi tersedia' : 'Wadah kasus pribadi belum tersedia'}</div></div>
      <div className="rounded-xl border border-[#3b6ea5] bg-[#0f2036] p-4"><div className="eyebrow text-[#9fd0ff]">JUMLAH WADAH</div><div data-testid="text-container-count" className="mt-2 text-sm font-bold text-white">{workspace.clients.length}</div></div>
    </div>
    {def && <div className="flex items-start gap-3 rounded-xl border border-[#3b6ea5] bg-[#14304f] p-4"><Box size={20} className="mt-0.5 shrink-0 text-[#9fd0ff]" /><div><div data-testid="text-container-name" className="text-sm font-bold text-white">{def.name}</div><div className="mt-1 text-xs text-[#cfe5fa]">{def.businessType ?? 'Jenis usaha belum diisi'}{def.isDefault ? ' · Bawaan' : ''}</div></div></div>}
    <p className="text-sm leading-7 text-[#e1efff]">Wadah kasus pribadi hanya berfungsi sebagai penampung catatan persiapan Anda. Ini bukan profil perusahaan terverifikasi dan bukan kolaborasi tim yang sudah aktif.</p>
  </div>;
}

export function WorkspaceFoundation({ expectedUserId }: { expectedUserId: string }) {
  const q = useGetWorkspace(useAccountReadOptions());
  let body;
  if (q.isLoading) body = <Loading rows={2} />;
  else if (q.isError) body = <ErrorState retry={() => q.refetch()} message="Status wadah kasus belum dapat dimuat." />;
  else if (!q.data || q.data.userId !== expectedUserId) body = <ErrorState retry={() => q.refetch()} message="Respons ruang kerja tidak sesuai dengan akun yang sedang masuk, sehingga tidak ditampilkan." />;
  else body = <WorkspaceFoundationView workspace={q.data} />;
  return <section data-testid="section-workspace-foundation" className="mt-6 rounded-2xl bg-[#0a1422] p-6 text-white sm:p-8"><div className="flex items-center gap-3"><ShieldCheck className="text-[#9fd0ff]" size={24} /><div><div className="eyebrow text-[#9fd0ff]">FONDASI RUANG KERJA</div><h2 className="display text-xl font-extrabold text-white">Wadah kasus pribadi</h2></div></div><div className="mt-6">{body}</div></section>;
}
