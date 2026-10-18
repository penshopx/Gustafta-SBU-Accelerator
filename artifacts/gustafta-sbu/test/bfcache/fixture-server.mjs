// Test-only HTTP service. Never imported by the application or its API server.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export async function startFixtureServer({ bundle, clerk, publishableKey, owners, marker }) {
  const pending = new Set();
  const requests = [];
  const unexpected = new Set();
  let mode = 'normal';
  let origin;
  const profile = (userId) => ({
    userId, role: 'kontraktor', organizationName: 'Synthetic workspace',
    displayName: userId === owners.a ? 'Cache Alpha' : 'Cache Beta',
  });
  const item = {
    id: 1, companyName: marker, requestType: 'baru', qualification: 'kecil',
    classification: 'Konstruksi', status: 'draf', existingSbuExpiresOn: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
  const send = (res, status, data, type = 'application/json') => {
    if (res.destroyed) return;
    res.writeHead(status, {
      'Content-Type': type,
      // A no-store document is evicted by Chromium when cookies change. Only
      // API responses need no-store; static production documents must be eligible.
      'Cache-Control': type === 'application/json' ? 'private, no-store' : 'no-cache',
    });
    res.end(type === 'application/json' ? JSON.stringify(data) : data);
  };
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, origin).pathname;
      // Login page loads the actual Clerk SDK, but not the application publisher.
      if (path === '/__bfcache/login') {
        const host = Buffer.from(publishableKey.split('_').slice(2).join('_'), 'base64').toString().replace(/\$$/, '');
        return send(res, 200, `<!doctype html><title>Isolated authentication</title>
          <script async crossorigin="anonymous" data-clerk-publishable-key="${publishableKey}"
          src="https://${host}/npm/@clerk/clerk-js@5/dist/clerk.browser.js"></script>`, 'text/html');
      }
      if (path === '/__bfcache/away') return send(res, 200, '<!doctype html><title>History destination</title>Outside the private app', 'text/html');
      if (path.startsWith('/api/')) {
        const state = await clerk.authenticateRequest(new Request(origin + req.url, {
          headers: req.headers,
        }), { publishableKey });
        const userId = state.toAuth()?.userId;
        if (![owners.a, owners.b].includes(userId)) return send(res, 401, { error: 'Unauthenticated' });
        if (req.method !== 'GET') return send(res, 405, { error: 'Read-only fixture' });
        const record = { path, startedAt: Date.now(), respondedAt: null, isB: userId === owners.b, status: null };
        requests.push(record);
        if (path === '/api/me' && mode === 'hold') {
          await new Promise((done) => {
            const release = () => { clearTimeout(timer); pending.delete(release); done(); };
            const timer = setTimeout(release, 8_000);
            pending.add(release);
            res.once('close', release);
          });
        }
        const reply = (status, data) => {
          record.status = status;
          record.respondedAt = Date.now();
          send(res, status, data);
        };
        if (path === '/api/me' && mode === 'fail') return reply(503, { error: 'Synthetic verification failure' });
        if (req.headers['x-sbu-form-owner'] !== userId) return reply(409, { error: 'Owner changed' });
        if (path === '/api/me') return reply(200, profile(userId));
        if (path === '/api/transition-verifications') return reply(403, { error: 'Not a reviewer' });
        if (path === '/api/dashboard') return reply(200, {
          total: userId === owners.a ? 1 : 0, draft: userId === owners.a ? 1 : 0,
          reviewing: 0, prepared: 0, recent: userId === owners.a ? [item] : [],
        });
        if (path === '/api/cases/1') return reply(userId === owners.a ? 200 : 404, userId === owners.a ? item : { error: 'Not found' });
        if (path.startsWith('/api/cases/1/') && userId !== owners.a) return reply(404, { error: 'Not found' });
        if (path === '/api/cases/1/workroom') return reply(200, { caseId: 1, items: [] });
        if (path === '/api/cases/1/workroom/reviews') return reply(200, {
          caseId: 1, historyTruncated: false, reviews: [],
          materials: { schemaVersion: 'review-v1', case: item, workroomItems: [], evidence: [], documents: [] },
        });
        if (path === '/api/cases/1/documents' || path === '/api/cases/1/evidence') return reply(200, []);
        // The detail shell needs no assessment data while its default evidence tab is open.
        if (path === '/api/cases/1/assessment') return reply(404, { error: 'No fixture assessment' });
        unexpected.add(path);
        return reply(501, { error: 'Missing test fixture' });
      }
      const file = resolve(bundle, '.' + decodeURIComponent(path));
      if (!file.startsWith(resolve(bundle) + sep)) return send(res, 403, {});
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
      if (path.startsWith('/assets/') || extname(path)) {
        try { return send(res, 200, await readFile(file), types[extname(file)] || 'application/octet-stream'); }
        catch { return send(res, 404, {}); }
      }
      // Make a real restored frame observable even on a sub-millisecond loopback
      // server: the guard's ordinary HTML reload must not outrun the next paint.
      // Only the test server adds latency; the production bundle is unchanged.
      if (mode !== 'normal') await new Promise((done) => setTimeout(done, 150));
      return send(res, 200, await readFile(resolve(bundle, 'index.html')), 'text/html');
    } catch {
      send(res, 500, { error: 'Isolated fixture server failed' });
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, requests, unexpected,
    setMode(value) { mode = value; },
    release() { for (const done of pending) done(); },
    async close() {
      for (const done of pending) done();
      const closed = new Promise((done) => server.close(done));
      server.closeAllConnections();
      await closed;
    },
  };
}
