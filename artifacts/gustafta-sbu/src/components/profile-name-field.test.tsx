import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement, useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { hasVisibleNameCharacter, ProfileNameField } from './profile-name-field';

test('nama kosong, spasi, kontrol, dan Unicode tak terlihat ditolak', () => {
  for (const name of ['', ' \t\n\u00a0', '\u200b', '\u200c\u200d', '\u0000\u009f',
    '\u00ad\u034f\u061c\u2060\ufeff', '\ufe0f', '\u{E0100}', '\u{E0001}', '\u0600\u06dd\u070f']) {
    assert.equal(hasVisibleNameCharacter(name), false, JSON.stringify(name));
  }
});

test('nama beraksara lain tetap menerima joiner dan variation selector', () => {
  for (const name of ['Ester', '李明', 'مریم', 'می\u200cنا', 'क्\u200dष', '👩\u200d💻', 'Nama\ufe0f']) {
    assert.equal(hasVisibleNameCharacter(name), true, name);
  }
});

test('peringatan langsung terhubung ke kolom dan hilang setelah nama diperbaiki', async () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const originalAct = globals.IS_REACT_ACT_ENVIRONMENT;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  function Field() {
    const [value, setValue] = useState('');
    return createElement(ProfileNameField, { value, onChange: setValue });
  }
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  try {
    await act(async () => { renderer = TestRenderer.create(createElement(Field)); });
    const input = () => renderer!.root.findByType('input');
    const alerts = () => renderer!.root.findAllByProps({ role: 'alert' });
    assert.equal(alerts().length, 0, 'kolom baru belum menampilkan kesalahan');
    await act(async () => { input().props.onBlur(); });
    assert.equal(alerts().length, 1, 'kolom kosong diperiksa saat ditinggalkan');
    for (const value of ['\u200b', ' \u200c\u200d ', '\u{E0100}']) {
      await act(async () => { input().props.onChange({ target: { value } }); });
      assert.equal(input().props['aria-invalid'], true);
      assert.equal(input().props['aria-describedby'], alerts()[0].props.id);
    }
    const joinedName = 'می\u200cنا';
    await act(async () => { input().props.onChange({ target: { value: joinedName } }); });
    assert.equal(alerts().length, 0);
    assert.equal(input().props['aria-invalid'], false);
    assert.equal(input().props['aria-describedby'], undefined);
    assert.equal(input().props.value, joinedName, 'joiner tidak dihapus');
    await act(async () => { input().props.onChange({ target: { value: '' } }); });
    assert.equal(alerts().length, 1, 'mengosongkan kembali nama menampilkan peringatan');
  } finally {
    await act(async () => { renderer?.unmount(); });
    globals.IS_REACT_ACT_ENVIRONMENT = originalAct;
  }
});
