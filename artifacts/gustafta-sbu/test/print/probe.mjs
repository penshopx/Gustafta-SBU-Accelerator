// Runs before any application code. Only the iframe's native print boundary
// and five-minute cleanup timers are instrumented; load/srcdoc remain real.
export function installPrintProbe() {
  const probe = window.printProbe = {
    mode: 'native', holdLoad: false, frames: [], calls: [], timers: new Map(),
  };
  const setTimeout = window.setTimeout.bind(window);
  const clearTimeout = window.clearTimeout.bind(window);
  window.setTimeout = (callback, delay, ...args) => {
    if (delay !== 300_000) return setTimeout(callback, delay, ...args);
    const id = setTimeout(() => {
      probe.timers.delete(id);
      callback(...args);
    }, delay);
    probe.timers.set(id, () => callback(...args));
    return id;
  };
  window.clearTimeout = (id) => {
    probe.timers.delete(id);
    return clearTimeout(id);
  };
  const appendChild = document.body.appendChild.bind(document.body);
  document.body.appendChild = (node) => {
    if (node.tagName !== 'IFRAME') return appendChild(node);
    const record = { frame: node, load: node.onload, loaded: false, beforeprint: 0, nativeBeforeprint: false, afterprint: 0, listeners: 0 };
    probe.frames.push(record);
    node.onload = (event) => {
      record.loaded = true;
      instrumentFrame();
      if (!probe.holdLoad) record.load.call(node, event);
    };
    // Bind to the loaded srcdoc Window, NOT the initial about:blank Window:
    // a native method bound before navigation can silently print nothing.
    function instrumentFrame() {
      const target = node.contentWindow;
      const nativePrint = target.print.bind(target);
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      const listeners = new Set();
      add('beforeprint', (event) => { record.beforeprint++; record.nativeBeforeprint = event.isTrusted; });
      add('afterprint', () => record.afterprint++);
      target.addEventListener = (type, listener, options) => {
        if (type === 'afterprint') { listeners.add(listener); record.listeners = listeners.size; }
        return add(type, listener, options);
      };
      target.removeEventListener = (type, listener, options) => {
        if (type === 'afterprint') { listeners.delete(listener); record.listeners = listeners.size; }
        return remove(type, listener, options);
      };
      target.print = () => {
        probe.calls.push({
          ready: target.document.readyState,
          loaded: record.loaded,
          text: target.document.body.textContent,
          sandbox: node.hasAttribute('sandbox'),
          csp: target.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
          images: target.document.images.length,
        });
        if (probe.mode === 'throw') throw new Error('Synthetic native print failure');
        if (probe.mode === 'native') nativePrint();
        // 'hold' deliberately leaves the frame alive to test disposal events.
      };
      if (probe.mode === 'missing-window') {
        Object.defineProperty(node, 'contentWindow', { get: () => null });
      }
    }
    return appendChild(node);
  };
}
