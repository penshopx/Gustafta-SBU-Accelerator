import React, { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CasePreparationExport } from '../../src/components/case-preparation-export';
import { preparationSummary } from '../../../api-server/src/lib/preparation-summary';
import { smapQuestions, SMAP_TEMPLATE, SMAP_DISCLAIMER } from '../../../api-server/src/lib/smap-checklist';

// Pure HTML generation only: the generator's database imports are type-only.
// No application router, auth provider, credentials or database is loaded.
const date = new Date('2026-01-15T12:00:00Z');
const companyName = '<img src="https://invalid.example/leak" onerror="parent.__injected=true"> & "Fixture"';
const html = preparationSummary({
  id: 1, ownerId: 'synthetic', companyName, requestType: 'baru',
  qualification: 'kecil', classification: 'gedung', status: 'draf',
  existingSbuExpiresOn: null, createdAt: date, updatedAt: date,
} as Parameters<typeof preparationSummary>[0], [], [], date, [], {
  caseId: 1, templateVersion: SMAP_TEMPLATE, disclaimer: SMAP_DISCLAIMER,
  questions: smapQuestions, documents: [], entries: [{
    questionId: 'SMC-I-01', revision: 2, answer: 'ada',
    notes: 'Deklarasi SMAP <script>uji</script>', evidence: [{
      id: '00000000-0000-4000-8000-000000000090', name: 'Dokumen SMAP <contoh>',
      version: 1, fingerprint: 'a'.repeat(64),
    }],
    reviewStatus: 'adequate', reviewNote: 'Telaah sintetis',
    reviewedBy: 'synthetic-reviewer', reviewedAt: date.toISOString(),
    savedAt: date.toISOString(), needsReview: true,
  }],
});

// The real generated API client still makes its HTTP request. Playwright serves
// this synthetic response at the network boundary, never the live API.
Object.assign(window, { summaryFixture: { html, companyName } });

const suspended = new Promise<never>(() => {});
function ExportSurface({ caseId, hidden }: { caseId: number; hidden: boolean }) {
  if (hidden) throw suspended;
  return <CasePreparationExport caseId={caseId}/>;
}

function Fixture() {
  const [caseId, setCaseId] = useState(1);
  const [mounted, setMounted] = useState(true);
  const [hidden, setHidden] = useState(false);
  return <>
    <button onClick={() => { setCaseId((id) => id + 1); setHidden(false); }}>Ganti kasus</button>
    <button onClick={() => setHidden(true)}>Tangguhkan tampilan</button>
    <button onClick={() => setMounted(false)}>Lepas komponen</button>
    <output data-testid="case-id">{caseId}</output>
    {mounted && <Suspense fallback={<p data-testid="export-fallback">Memuat kasus berikutnya</p>}>
      <ExportSurface caseId={caseId} hidden={hidden}/>
    </Suspense>}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
