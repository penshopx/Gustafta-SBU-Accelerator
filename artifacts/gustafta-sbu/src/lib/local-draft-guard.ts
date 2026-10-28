const MESSAGE = 'Tindakan atau draf lokal bisa hilang. Cadangkan terlebih dahulu jika diperlukan. Tetap tinggalkan halaman?';

// Authentication transitions must not be delayed by a local, public mini app.
function isAuthPath(path: string) {
  return /\/(?:sign-in|sign-up|sign-out|login|logout|auth)(?:\/|$)/i.test(path);
}

type NavigationEvent = Event & { navigationType?: string; destination?: { url: string } };
type NavigationTarget = EventTarget;

/** Installed only while local data is at risk. No history patching or storage. */
export function installLocalDraftGuard(win: Window): () => void {
  let approved = false;
  let approvalTimer: ReturnType<Window['setTimeout']> | undefined;
  const approveOnce = () => {
    approved = true;
    if (approvalTimer !== undefined) win.clearTimeout(approvalTimer);
    approvalTimer = win.setTimeout(() => { approved = false; }, 0);
  };
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (approved) return;
    event.preventDefault();
    event.returnValue = '';
  };
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const next = new URL(anchor.href, win.location.href);
    if (!['http:', 'https:'].includes(next.protocol)) return;
    if (isAuthPath(next.pathname) && next.origin === win.location.origin) {
      approveOnce();
      return;
    }
    if (next.origin === win.location.origin && next.pathname === win.location.pathname && next.search === win.location.search) return;
    // Cross-origin navigation uses the native beforeunload prompt instead.
    if (next.origin !== win.location.origin) return;
    if (!win.confirm(MESSAGE)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else approveOnce();
    // A local router link has no unload; do not disable the guard globally.
  };
  // Navigation API can cancel history traversals without rewriting history.
  // Older browsers fall back to link interception + native beforeunload.
  const navigation = (win as Window & { navigation?: NavigationTarget }).navigation;
  const traverse = (event: Event) => {
    const nav = event as NavigationEvent;
    if (nav.navigationType !== 'traverse' || !nav.cancelable || !nav.destination) return;
    const next = new URL(nav.destination.url, win.location.href);
    if (next.origin === win.location.origin && isAuthPath(next.pathname)) { approveOnce(); return; }
    if (next.pathname === win.location.pathname && next.search === win.location.search) return;
    if (!win.confirm(MESSAGE)) nav.preventDefault();
    else approveOnce();
  };
  win.addEventListener('beforeunload', beforeUnload);
  win.document.addEventListener('click', click, true);
  navigation?.addEventListener('navigate', traverse);
  return () => {
    if (approvalTimer !== undefined) win.clearTimeout(approvalTimer);
    win.removeEventListener('beforeunload', beforeUnload);
    win.document.removeEventListener('click', click, true);
    navigation?.removeEventListener('navigate', traverse);
  };
}
