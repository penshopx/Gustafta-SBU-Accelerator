import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Disclaimer, DISCLAIMER_TEXT } from './disclaimer';
import { WorkspaceFoundationView } from './workspace-foundation';

const text = (el: React.ReactElement) => { let r!: TestRenderer.ReactTestRenderer; act(() => { r = TestRenderer.create(el); }); return JSON.stringify(r.toJSON()); };

test('disclaimer renders exact text', () => {
  assert.ok(text(<Disclaimer />).includes(DISCLAIMER_TEXT));
});
test('workspace view hides raw account ids', () => {
  const out = text((<WorkspaceFoundationView workspace={{ userId: 'user_secret', orgId: 777, role: 'owner', clientIds: [5], clients: [{ id: 5, name: 'Wadah', businessType: null, isDefault: true }], disclaimer: '' }} />));
  assert.ok(!out.includes('user_secret') && !out.includes('777'));
  assert.ok(out.includes('bukan profil perusahaan terverifikasi'));
});
