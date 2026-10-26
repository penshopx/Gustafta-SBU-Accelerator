import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountQueries } from '../../src/components/account-queries';
import SbuChatPage from '../../src/components/sbu-chat-page';
import { DocumentVaultPage } from '../../src/components/document-vault-page';

// No application router, Clerk session, credentials or database. Real hooks
// and API client are retained; the browser test intercepts every API request.
function Fixture() {
  const [owner, setOwner] = useState('synthetic-chat-owner');
  return <>
    {new URLSearchParams(location.search).has('quota') && <nav aria-label="Akun sintetis">
      <button onClick={() => setOwner('synthetic-chat-owner')}>Akun sintetis A</button>
      <button onClick={() => setOwner('synthetic-chat-owner-b')}>Akun sintetis B</button>
      <output data-testid="fixture-owner">{owner}</output>
    </nav>}
    {/* Match the application's identity-keyed cache and private page boundary. */}
    <AccountQueries key={owner} userId={owner}>
      {new URLSearchParams(location.search).has('vault')
        ? <DocumentVaultPage key={owner} expectedUserId={owner} canOwnCases={true} />
        : <SbuChatPage key={owner} expectedUserId={owner} initialRole="kontraktor" />}
    </AccountQueries>
  </>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
