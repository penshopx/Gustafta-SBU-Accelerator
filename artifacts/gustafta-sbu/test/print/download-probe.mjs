// Preserve native Blob URLs and anchor clicks, but control the one-second
// cleanup timer so assertions cannot race the browser's wall clock.
export function installDownloadProbe() {
  const probe = window.downloadProbe = {
    blobs: [], clicks: [], revoked: [], active: new Set(), timers: new Map(),
  };
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    probe.blobs.push({ blob, url });
    probe.active.add(url);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    probe.revoked.push(url);
    probe.active.delete(url);
    return revoke(url);
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    probe.clicks.push({ href: this.href, download: this.download });
    return click.call(this);
  };
  const setTimeout = window.setTimeout.bind(window);
  const clearTimeout = window.clearTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    if (delay !== 1000) return setTimeout(callback, delay, ...args);
    // Allocate a genuine timer handle, but only fire when the test asks.
    const id = setTimeout(() => {}, 2_147_483_647);
    probe.timers.set(id, () => {
      clearTimeout(id);
      probe.timers.delete(id);
      callback(...args);
    });
    return id;
  };
  window.clearTimeout = (id) => {
    probe.timers.delete(id);
    return clearTimeout(id);
  };
}
