import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ClipboardList, ListChecks, NotebookPen, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useGetWorkroom, useCreateWorkroomItem, useUpdateWorkroomItem, useDeleteWorkroomItem, getGetWorkroomQueryKey,
  type Workroom, type WorkroomItem, type WorkroomItemKind, type WorkroomItemStatus,
} from '@workspace/api-client-react';
import { useAccountReadOptions, useFormMutationOptions } from './account-queries';
import { hasVisibleNameCharacter } from './profile-name-field';
import { ErrorState, Loading } from './request-states';
import { WorkroomAgenda } from './workroom-agenda';

const kindMeta: Record<WorkroomItemKind, { label: string; add: string; icon: typeof ListChecks }> = {
  checklist: { label: 'Daftar periksa', add: 'Tambah butir', icon: ListChecks },
  action: { label: 'Tindak lanjut', add: 'Tambah tindakan', icon: ClipboardList },
  journal: { label: 'Catatan kerja', add: 'Tambah catatan', icon: NotebookPen },
};
const statusLabel: Record<WorkroomItemStatus, string> = { todo: 'Belum', doing: 'Berjalan', done: 'Selesai' };
const kinds: WorkroomItemKind[] = ['checklist', 'action', 'journal'];
const fmtDay = (d: string) => { const [y, m, day] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
const fmtStamp = (s: string) => new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const isConflict = (e: unknown) => (e as { status?: number } | null)?.status === 409;
const msg = (e: unknown) => isConflict(e) ? 'Item ini sudah diubah di tempat lain. Muat ulang untuk melihat versi terbaru; draf Anda tidak dikirim ulang otomatis.' : e instanceof Error && e.message ? e.message : 'Perubahan belum tersimpan. Coba lagi.';

type Target = { mode: 'create'; kind: WorkroomItemKind } | { mode: 'edit'; item: WorkroomItem };

function Dialog({ title, label, close: rawClose, busy = false, children }: { title: string; label: string; close: () => void; busy?: boolean; children: React.ReactNode }) {
  const close = () => { if (!busy) rawClose(); };
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0d1b2ad9] p-4" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
    <section role="dialog" aria-modal="true" aria-label={label} data-testid="dialog-workroom" className="surface my-auto w-full max-w-[540px] overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#d8e4ec] p-5"><h2 className="display text-lg font-extrabold">{title}</h2><button type="button" onClick={close} aria-label="Tutup" disabled={busy} data-testid="button-workroom-close" className="rounded-lg p-2 hover:bg-[#ecf4f9]"><X size={18} /></button></div>
      <div className="p-5">{children}</div>
    </section></div>;
}

function ItemEditor({ caseId, target, close, onRefresh }: { caseId: number; target: Target; close: () => void; onRefresh: () => void }) {
  const qc = useQueryClient(); const options = useFormMutationOptions();
  const create = useCreateWorkroomItem(options); const update = useUpdateWorkroomItem(options);
  const item = target.mode === 'edit' ? target.item : null;
  const kind = item ? item.kind : (target as { kind: WorkroomItemKind }).kind;
  const [revision] = useState(item?.revision ?? 0);
  const [title, setTitle] = useState(item?.title ?? ''); const [body, setBody] = useState(item?.body ?? '');
  const [status, setStatus] = useState<WorkroomItemStatus>(item?.status ?? 'todo');
  const [assignee, setAssignee] = useState(item?.assignee ?? ''); const [dueOn, setDueOn] = useState(item?.dueOn ?? '');
  const pending = create.isPending || update.isPending; const error = create.error || update.error;
  const valid = hasVisibleNameCharacter(title) && title.trim().length <= 200;
  const done = () => { qc.invalidateQueries({ queryKey: getGetWorkroomQueryKey(caseId) }); close(); };
  const submit = (e: FormEvent) => {
    e.preventDefault(); if (pending || !valid) return;
    const fields: { body: string; status?: WorkroomItemStatus; assignee?: string; dueOn?: string | null } = { body };
    if (kind === 'checklist') fields.status = status;
    if (kind === 'action') { fields.status = status; fields.assignee = assignee.trim(); fields.dueOn = dueOn || null; }
    if (item) update.mutate({ id: caseId, itemId: item.id, data: { revision, title: title.trim(), ...fields } }, { onSuccess: done });
    else create.mutate({ id: caseId, data: { kind, title: title.trim(), ...fields } }, { onSuccess: done });
  };
  const m = kindMeta[kind];
  return <Dialog title={`${item ? 'Ubah' : 'Baru'}: ${m.label}`} label={`${item ? 'Ubah' : 'Tambah'} ${m.label}`} close={close} busy={pending}>
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">{kind === 'journal' ? 'Judul catatan' : 'Judul'}</span><input data-testid="input-workroom-title" className="field" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} autoFocus aria-invalid={title.length > 0 && !valid} /></label>
      {(kind === 'checklist' || kind === 'action') && <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Status</span><select data-testid="select-workroom-status" className="field" value={status} onChange={e => setStatus(e.target.value as WorkroomItemStatus)}>{(Object.keys(statusLabel) as WorkroomItemStatus[]).map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}</select></label>}
      {kind === 'action' && <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Penanggung jawab</span><input data-testid="input-workroom-assignee" className="field" maxLength={200} value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Nama bebas, opsional" /><span className="mt-1.5 block text-xs text-[#688096]">Hanya teks catatan; tidak memberi akses ke akun mana pun.</span></label>
        <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">Tenggat</span><input data-testid="input-workroom-due" type="date" className="field" value={dueOn} onChange={e => setDueOn(e.target.value)} /></label></div>}
      <label className="block"><span className="mb-2 block text-xs font-bold text-[#2b4159]">{kind === 'journal' ? 'Isi catatan' : 'Keterangan'}</span><textarea data-testid="input-workroom-body" className="field min-h-[110px]" maxLength={10000} value={body} onChange={e => setBody(e.target.value)} placeholder={kind === 'journal' ? 'Catatan kerja Anda; dapat diubah kapan saja.' : 'Opsional'} /></label>
      {error && <div role="alert" data-testid="text-workroom-error" className="text-sm text-[#b34442]">{msg(error)}{isConflict(error) && <button type="button" data-testid="button-workroom-refresh" onClick={() => { onRefresh(); close(); }} className="mt-2 block font-bold underline">Muat ulang dan tutup</button>}</div>}
      <div className="flex justify-end gap-2 border-t border-[#e0e9ef] pt-4"><button type="button" disabled={pending} onClick={close} data-testid="button-workroom-cancel" className="btn btn-outline">Batal</button><button data-testid="button-workroom-save" disabled={pending || !valid} className="btn btn-primary">{pending ? 'Menyimpan...' : 'Simpan'}</button></div>
    </form></Dialog>;
}

function DeleteConfirm({ caseId, item, close, onRefresh }: { caseId: number; item: WorkroomItem; close: () => void; onRefresh: () => void }) {
  const qc = useQueryClient(); const del = useDeleteWorkroomItem(useFormMutationOptions()); const [revision] = useState(item.revision);
  return <Dialog title="Hapus item?" label="Konfirmasi hapus" close={close} busy={del.isPending}>
    <p className="text-sm leading-6 text-[#47667e]">"{item.title}" akan dihapus dari ruang kerja kasus ini. Tindakan ini tidak dapat dibatalkan.</p>
    {del.error && <div role="alert" data-testid="text-workroom-delete-error" className="mt-3 text-sm text-[#b34442]">{msg(del.error)}{isConflict(del.error) && <button type="button" data-testid="button-workroom-delete-refresh" onClick={() => { onRefresh(); close(); }} className="mt-2 block font-bold underline">Muat ulang dan tutup</button>}</div>}
    <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={del.isPending} onClick={close} data-testid="button-workroom-delete-cancel" className="btn btn-outline">Batal</button>
      <button type="button" disabled={del.isPending} data-testid="button-workroom-delete-confirm" onClick={() => { if (!del.isPending) del.mutate({ id: caseId, itemId: item.id, data: { revision } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetWorkroomQueryKey(caseId) }); close(); } }); }} className="btn btn-danger">{del.isPending ? 'Menghapus...' : 'Hapus'}</button></div>
  </Dialog>;
}

function ItemCard({ caseId, item, onEdit, onDelete, onRefresh, locked }: { caseId: number; item: WorkroomItem; onEdit: () => void; onDelete: () => void; onRefresh: () => void; locked: boolean }) {
  const qc = useQueryClient(); const patch = useUpdateWorkroomItem(useFormMutationOptions());
  const toggle = (status: WorkroomItemStatus) => { if (patch.isPending) return; patch.mutate({ id: caseId, itemId: item.id, data: { revision: item.revision, status } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetWorkroomQueryKey(caseId) }) }); };
  const done = item.status === 'done';
  return <li data-testid={`card-workroom-${item.id}`} className="rounded-xl border border-[#dbe8f1] bg-white p-4">
    <div className="flex items-start gap-3">
      {item.kind === 'checklist' && <button type="button" role="checkbox" aria-checked={done} aria-label={`Tandai selesai: ${item.title}`} data-testid={`checkbox-workroom-${item.id}`} disabled={patch.isPending || locked} onClick={() => toggle(done ? 'todo' : 'done')} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border ${done ? 'border-[#1769d1] bg-[#1769d1] text-white' : 'border-[#9fb6c9] bg-white'}`}>{done && <Check size={14} />}</button>}
      <div className="min-w-0 flex-1">
        <p className={`break-words text-sm font-bold text-[#19324a] ${item.kind === 'checklist' && done ? 'line-through opacity-60' : ''}`}>{item.title}</p>
        {item.body && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#56718a]">{item.body}</p>}
        {item.kind === 'action' && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#4a647b]">
          <select aria-label="Status tindakan" data-testid={`select-status-${item.id}`} disabled={patch.isPending || locked} value={item.status} onChange={e => toggle(e.target.value as WorkroomItemStatus)} className="rounded-md border border-[#bfcedc] bg-white px-2 py-1 text-xs font-bold">{(Object.keys(statusLabel) as WorkroomItemStatus[]).map(s => <option key={s} value={s}>{statusLabel[s]}</option>)}</select>
          <span data-testid={`text-assignee-${item.id}`}>{item.assignee ? `Catatan PJ: ${item.assignee}` : 'Belum ada penanggung jawab'}</span>
          <span className="inline-flex items-center gap-1" data-testid={`text-due-${item.id}`}><CalendarDays size={13} />{item.dueOn ? fmtDay(item.dueOn) : 'Tanpa tenggat'}</span></div>}
        {item.kind === 'journal' && <p className="mt-2 text-[11px] text-[#688096]">Diperbarui {fmtStamp(item.updatedAt)} · catatan kerja, dapat diubah</p>}
        {patch.error && <p role="alert" data-testid={`text-card-error-${item.id}`} className="mt-2 text-xs text-[#b34442]">{msg(patch.error)}{isConflict(patch.error) && <button type="button" data-testid={`button-card-refresh-${item.id}`} onClick={() => { patch.reset(); onRefresh(); }} className="ml-2 font-bold underline">Muat ulang</button>}</p>}
      </div>
      <div className="flex shrink-0 gap-1"><button type="button" aria-label={`Ubah ${item.title}`} data-testid={`button-edit-workroom-${item.id}`} disabled={locked || patch.isPending} onClick={onEdit} className="rounded-lg p-2 hover:bg-[#ecf4f9]"><Pencil size={15} /></button><button type="button" aria-label={`Hapus ${item.title}`} data-testid={`button-delete-workroom-${item.id}`} disabled={locked || patch.isPending} onClick={onDelete} className="rounded-lg p-2 text-[#ae3b3a] hover:bg-[#fbeeed]"><Trash2 size={15} /></button></div>
    </div></li>;
}

export function CaseWorkroom({ caseId, expectedUserId }: { caseId: number; expectedUserId: string }) {
  const readOptions = useAccountReadOptions();
  const q = useGetWorkroom(caseId, { ...readOptions, query: { queryKey: getGetWorkroomQueryKey(caseId), staleTime: 15000, refetchOnMount: 'always', refetchOnWindowFocus: true } });
  const [target, setTarget] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<WorkroomItem | null>(null);
  const [tab, setTab] = useState<WorkroomItemKind>('checklist');
  const data = q.data as Workroom | undefined;
  const foreign = !!data && (data.caseId !== caseId || data.items.some(i => i.caseId !== caseId));
  const items = data && !foreign ? data.items : [];
  const by = (k: WorkroomItemKind) => items.filter(i => i.kind === k);
  const cl = by('checklist'); const ac = by('action');
  const clDone = cl.filter(i => i.status === 'done').length; const acDone = ac.filter(i => i.status === 'done').length;
  const list = by(tab);
  const refresh = () => { void q.refetch(); };
  return <section aria-labelledby="workroom-title" data-testid="section-workroom" data-owner={expectedUserId} className="surface mb-7 overflow-hidden">
    <div className="border-b border-[#d8e4ec] p-5 sm:p-6">
      <div className="eyebrow text-[#1769d1]">MEJA KERJA PRIBADI</div>
      <h2 id="workroom-title" className="display mt-2 text-xl font-extrabold text-[#19324a]">Ruang kerja kasus</h2>
      <p data-testid="text-workroom-disclaimer" className="mt-2 text-sm leading-6 text-[#47667e]">Ini daftar periksa manual internal Anda. Menandai butir selesai bukan sertifikasi, bukan persetujuan LSBU, dan tidak mengubah penilaian kasus.</p>
    </div>
    <div className="p-5 sm:p-6">
      {q.isLoading ? <div data-testid="state-workroom-loading" aria-busy="true"><Loading rows={3} /></div>
        : q.isError || foreign ? <ErrorState retry={refresh} message={foreign ? 'Data ruang kerja tidak cocok dengan kasus ini.' : undefined} />
        : <>
          <WorkroomAgenda key={`${expectedUserId}:${caseId}`} caseId={caseId} items={items} onEdit={item => { if (!target && !deleting) setTarget({ mode: 'edit', item }); }} onAdd={() => { if (!target && !deleting) setTarget({ mode: 'create', kind: 'action' }); }} />
          <div data-testid="text-workroom-progress" className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs font-semibold text-[#3c566d]">
            <span>Daftar periksa: {clDone} dari {cl.length} butir tercatat selesai</span><span>Tindakan: {acDone} dari {ac.length} selesai</span><span>Catatan: {by('journal').length}</span><button type="button" data-testid="button-workroom-reload" aria-label="Muat ulang ruang kerja" disabled={q.isFetching} onClick={refresh} className="font-bold text-[#1769d1] underline disabled:opacity-50">{q.isFetching ? 'Memuat...' : 'Muat ulang'}</button></div>
          <div role="tablist" aria-label="Jenis item" className="mb-4 flex gap-1 overflow-x-auto border-b border-[#d4e1ea]">
            {kinds.map(k => { const I = kindMeta[k].icon; return <button key={k} role="tab" aria-selected={tab === k} type="button" data-testid={`tab-workroom-${k}`} onClick={() => setTab(k)} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${tab === k ? 'border-[#1769d1] text-[#1769d1]' : 'border-transparent text-[#617a90]'}`}><I size={15} />{kindMeta[k].label} ({by(k).length})</button>; })}
          </div>
          <div className="mb-4 flex justify-end"><button type="button" data-testid={`button-add-workroom-${tab}`} onClick={() => setTarget({ mode: 'create', kind: tab })} className="btn btn-primary"><Plus size={15} /> {kindMeta[tab].add}</button></div>
          {list.length === 0 ? <div data-testid="state-workroom-empty" className="rounded-xl border border-dashed border-[#bfd0de] p-8 text-center text-sm text-[#56718a]">Belum ada {kindMeta[tab].label.toLowerCase()} untuk kasus ini. Tambahkan yang Anda perlukan; tidak ada isian bawaan.</div>
            : <ul className="space-y-3">{list.map(i => <ItemCard key={i.id} caseId={caseId} item={i} locked={!!target || !!deleting} onEdit={() => setTarget({ mode: 'edit', item: i })} onDelete={() => setDeleting(i)} onRefresh={refresh} />)}</ul>}
          {q.isFetching && !q.isLoading && <p className="mt-3 text-xs text-[#688096]" role="status">Memperbarui...</p>}
        </>}
    </div>
    {target && <ItemEditor key={target.mode === 'edit' ? target.item.id : `new-${target.kind}`} caseId={caseId} target={target} close={() => setTarget(null)} onRefresh={refresh} />}
    {deleting && <DeleteConfirm key={deleting.id} caseId={caseId} item={deleting} close={() => setDeleting(null)} onRefresh={refresh} />}
  </section>;
}
