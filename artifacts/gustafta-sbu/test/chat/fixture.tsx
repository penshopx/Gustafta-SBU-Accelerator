import React from 'react';
import { createRoot } from 'react-dom/client';
import { AccountQueries } from '../../src/components/account-queries';
import SbuChatPage from '../../src/components/sbu-chat-page';

// No application router, Clerk session, credentials or database. Real hooks
// and API client are retained; the browser test intercepts every API request.
createRoot(document.getElementById('root')!).render(
  <AccountQueries userId="synthetic-chat-owner">
    <SbuChatPage expectedUserId="synthetic-chat-owner" initialRole="kontraktor" />
  </AccountQueries>,
);
