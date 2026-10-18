// Runs before the production app, on every document; reports contain no identity values.
export function installProbe({ marker, bId }) {
  const key = '__bfcache_report';
  const now = () => performance.timeOrigin + performance.now();
  const records = () => JSON.parse(sessionStorage.getItem(key) || '[]');
  const save = (record) => sessionStorage.setItem(key, JSON.stringify([...records(), record]));
  const visible = (element) => !!element && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';
  const snapshot = () => {
    const gate = [...document.querySelectorAll('#root div')]
      .find((el) => el.style.display === 'contents' || el.style.display === 'none');
    const sidebar = document.querySelector('[data-testid="text-sidebar-name"]');
    return {
      visibility: document.visibilityState,
      gateDisplay: gate?.style.display ?? null,
      markerVisible: document.body?.innerText.includes(marker) ?? false,
      sidebarVisible: visible(sidebar),
      shellIsB: visible(sidebar) && sidebar.textContent.trim() === 'Cache Beta',
      clerkIsB: window.Clerk?.user?.id === bId,
    };
  };
  let loggedB = false;
  let leakLogged = false;
  const check = () => {
    const state = snapshot();
    if (sessionStorage.getItem('__bfcache_armed') !== 'yes') return;
    if ((state.markerVisible || state.sidebarVisible && !state.shellIsB) && !leakLogged) {
      leakLogged = true;
      save({ type: 'private-leak', at: now(), ...state });
    }
    if (state.shellIsB && !loggedB) {
      loggedB = true;
      const me = performance.getEntriesByType('resource')
        .filter((entry) => new URL(entry.name).pathname === '/api/me').at(-1);
      save({
        type: 'first-b-shell', at: now(), ...state,
        meResponseEnd: me ? performance.timeOrigin + me.responseEnd : null,
        meStatus: me?.responseStatus ?? null,
      });
    }
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  const frame = () => { check(); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
  addEventListener('pageshow', (event) => {
    const reasons = (node) => node ? [
      ...(node.reasons || []).map((item) => item.reason),
      ...(node.children || []).flatMap(reasons),
    ].filter((reason) => typeof reason === 'string' && /^[a-z-]{1,128}$/.test(reason)) : [];
    save({
      type: 'pageshow', at: now(), trusted: event.isTrusted, persisted: event.persisted,
      notRestoredReasons: reasons(performance.getEntriesByType('navigation')[0]?.notRestoredReasons),
      ...snapshot(),
    });
    if (event.persisted) requestAnimationFrame(() => {
      save({ type: 'first-restored-frame', at: now(), ...snapshot() });
      check();
    });
  }, true);
}

export function assertEvidence(records, { failure = false } = {}) {
  const restore = records.find((r) => r.type === 'pageshow' && r.persisted && r.trusted);
  const frame = records.find((r) => r.type === 'first-restored-frame' && r.at >= (restore?.at ?? Infinity));
  if (!restore) throw new Error('BFCACHE_INACTIVE');
  if (!frame) throw new Error('FIRST_RESTORED_FRAME_MISSING');
  for (const r of [restore, frame]) {
    if (r.gateDisplay !== 'none' || r.markerVisible || r.sidebarVisible) throw new Error('PRIVATE_SURFACE_LEAK');
  }
  if (records.some((r) => r.type === 'private-leak' || r.markerVisible)) throw new Error('PRIVATE_SURFACE_LEAK');
  const shell = records.find((r) => r.type === 'first-b-shell');
  if (failure) {
    if (shell) throw new Error('SHELL_OPENED_ON_VERIFICATION_FAILURE');
  } else {
    if (!shell || !shell.shellIsB || !shell.clerkIsB || shell.meStatus !== 200 ||
        !(shell.meResponseEnd > restore.at && shell.at >= shell.meResponseEnd)) {
      throw new Error('IDENTITY_RESPONSE_ORDER_NOT_PROVEN');
    }
  }
  return { restoredAt: restore.at, firstFrameAt: frame.at, firstBShellAt: shell?.at ?? null, meResponseEnd: shell?.meResponseEnd ?? null };
}
