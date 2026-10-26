import { useCallback, useRef, useState } from 'react';
import { useListCases, getListCasesQueryKey, type SbuChatAnalysisContext } from '@workspace/api-client-react';
import { useAccountReadOptions } from './account-queries';
import type { ReactNode } from 'react';
import { ConsultationAnalysisPicker, type AnalysisChoice, type DocumentScope } from './consultation-analysis-picker';

// Only mounted after the user opts in, so no case/document/analysis list is read earlier.
export function ChatAnalysisPicker({ locked, onChange, scope, emptyAction }: {
  locked: boolean; onChange: (ctx: SbuChatAnalysisContext | undefined) => void;
  scope?: { caseId: number } & DocumentScope; emptyAction?: ReactNode;
}) {
  const read = useAccountReadOptions();
  const cases = useListCases({ ...read, query: { queryKey: getListCasesQueryKey(), enabled: !scope } });
  const [pickedCase, setCaseId] = useState<number | null>(null);
  const caseId = scope ? scope.caseId : pickedCase;
  const cb = useRef(onChange); cb.current = onChange;
  const handle = useCallback((c: AnalysisChoice) => {
    cb.current(c.selection && caseId ? { caseId, selection: c.selection } : undefined);
  }, [caseId]);
  return <div data-testid="panel-chat-source" className="mt-3 rounded-lg border border-[#d8e4ec] bg-[#f4f9fc] p-3.5 text-xs leading-5 text-[#34506a]">
    {!scope && <label className="block font-bold">Kasus milik Anda
      <select data-testid="select-chat-source-case" className="field mt-2 w-full" disabled={locked} value={caseId ?? ''} onChange={e => { cb.current(undefined); setCaseId(e.target.value ? Number(e.target.value) : null); }}>
        <option value="">Pilih kasus</option>
        {cases.data?.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
      </select>
    </label>}
    {!scope && cases.isLoading && <p className="mt-2">Memuat kasus…</p>}
    {!scope && cases.isSuccess && !cases.data.length && <p className="mt-2">Belum ada kasus untuk dipilih.</p>}
    {!scope && cases.isError && <p role="alert" className="mt-2 text-[#8e2f2e]">Kasus belum dapat dimuat. <button type="button" className="underline" onClick={() => void cases.refetch()}>Coba lagi</button></p>}
    {caseId !== null && <ConsultationAnalysisPicker key={caseId} caseId={caseId} destination="assistant" disabled={locked} onChange={handle} documentScope={scope} emptyAction={emptyAction} />}
    {locked && <p data-testid="text-source-locked" className="mt-2 font-medium">Sumber terkunci selama percakapan berjalan. Untuk mengganti atau melepas sumber, mulai Percakapan baru.</p>}
  </div>;
}
