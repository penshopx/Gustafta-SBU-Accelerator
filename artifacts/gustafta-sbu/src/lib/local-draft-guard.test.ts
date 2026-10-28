import assert from 'node:assert/strict';
import test from 'node:test';
import { Window as HappyWindow } from 'happy-dom';
import { installLocalDraftGuard } from './local-draft-guard';

test('local draft guard cancels/permits links without intercepting anchors, downloads, tabs or auth', async () => {
  const win = new HappyWindow({ url: 'http://localhost/mini-apps' });
  let answer = false;
  let prompts = 0;
  win.confirm = () => { prompts++; return answer; };
  const cleanup = installLocalDraftGuard(win as unknown as Window);
  const link = (href: string, extras: Record<string, string> = {}, modifiers = {}) => {
    const anchor = win.document.createElement('a');
    anchor.href = href;
    for (const [key, value] of Object.entries(extras)) anchor.setAttribute(key, value);
    win.document.body.append(anchor);
    const event = new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...modifiers });
    anchor.dispatchEvent(event);
    anchor.remove();
    return event.defaultPrevented;
  };
  const unload = () => {
    const event = new win.Event('beforeunload', { cancelable: true });
    win.dispatchEvent(event);
    return event.defaultPrevented;
  };
  try {
    assert.equal(unload(), true);
    assert.equal(link('/cases'), true, 'cancel prevents router handler');
    assert.equal(prompts, 1);
    for (const href of ['#pelacak-tindakan', '/mini-apps#lain', 'mailto:local@example.invalid', 'https://example.invalid/']) {
      assert.equal(link(href), false);
    }
    assert.equal(link('/cases', { target: '_blank' }), false);
    assert.equal(link('/cases', { download: '' }), false);
    assert.equal(link('/cases', {}, { ctrlKey: true }), false);
    assert.equal(prompts, 1);
    answer = true;
    assert.equal(link('/dashboard'), false);
    assert.equal(unload(), false, 'accepted link does not cause double prompt');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(unload(), true, 'approval does not disable future protection');
    answer = false;
    for (const href of ['/sign-in', '/sign-up', '/sign-out', '/logout', '/auth/callback']) {
      assert.equal(link(href), false);
      assert.equal(unload(), false, 'auth transition exempt');
    }
    assert.equal(prompts, 2);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(unload(), true);
    cleanup();
    assert.equal(unload(), false);
    assert.equal(link('/cases'), false);
    assert.equal(prompts, 2, 'cleanup removes capture listener');
  } finally {
    cleanup();
    await win.happyDOM.close();
  }
});

test('supported history traversals can be cancelled without rewriting browser history', async () => {
  const win = new HappyWindow({ url: 'http://localhost/mini-apps' });
  const navigation = new win.EventTarget();
  Object.defineProperty(win, 'navigation', { value: navigation });
  let answer = false;
  win.confirm = () => answer;
  const cleanup = installLocalDraftGuard(win as unknown as Window);
  const traverse = (url: string) => {
    const event = new win.Event('navigate', { cancelable: true });
    Object.assign(event, { navigationType: 'traverse', destination: { url } });
    navigation.dispatchEvent(event);
    return event.defaultPrevented;
  };
  try {
    const historyLength = win.history.length;
    assert.equal(traverse('/dashboard'), true);
    assert.equal(win.location.pathname, '/mini-apps');
    assert.equal(win.history.length, historyLength);
    assert.equal(traverse('/mini-apps#anchor'), false);
    assert.equal(traverse('/sign-in'), false);
    answer = true;
    assert.equal(traverse('/dashboard'), false);
    cleanup();
    answer = false;
    assert.equal(traverse('/dashboard'), false);
  } finally {
    cleanup();
    await win.happyDOM.close();
  }
});
