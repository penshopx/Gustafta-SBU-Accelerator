import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CasePreparationExport } from '../../src/components/case-preparation-export';
import { preparationSummary } from '../../../api-server/src/lib/preparation-summary';

// Pure HTML generation only: the generator's database imports are type-only.
// No application router, auth provider, credentials or database is loaded.
const date = new Date('2026-01-15T12:00:00Z');
const companyName = '<img src="https://invalid.example/leak" onerror="parent.__injected=true"> & "Fixture"';
const html = preparationSummary({
  id: 1, ownerId: 'synthetic', companyName, requestType: 'baru',
  qualification: 'kecil', classification: 'gedung', status: 'draf',
  existingSbuExpiresOn: null, createdAt: date, updatedAt: date,
} as Parameters<typeof preparationSummary>[0], [], [], date);

// The real generated API client still makes its HTTP request. Playwright serves
// this synthetic response at the network boundary, never the live API.
Object.assign(window, { summaryFixture: { html, companyName } });

function Fixture() {
  const [caseId, setCaseId] = useState(1);
  const [mounted, setMounted] = useState(true);
  return <>
    <button onClick={() => setCaseId((id) => id + 1)}>Ganti kasus</button>
    <button onClick={() => setMounted(false)}>Lepas komponen</button>
    <output data-testid="case-id">{caseId}</output>
    {mounted && <CasePreparationExport caseId={caseId}/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
