import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import React, { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { Router } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey, useGetMe, type Profile } from '@workspace/api-client-react';

// Load App through Vite, just as production does (aliases, JSX and import.meta.env).
// The public key below is a synthetic fixture; no Clerk provider is mounted and
// every HTTP request is intercepted. No account or live database is needed.
test('formulir profil lengkap menjaga nama Unicode pada onboarding dan pengaturan', async t => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = {
    window: globals.window, document: globals.document, fetch: globals.fetch,
    actEnvironment: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  const window = new HappyWindow({ url: 'http://localhost/' });
  globals.window = window as unknown as Window & typeof globalThis;
  globals.document = window.document as unknown as Document;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  // React DOM detects input-event support when first imported.
  const { createRoot } = await import('react-dom/client');
  const rootDir = fileURLToPath(new URL('../../', import.meta.url));
  const server = await createServer({
    configFile: false, root: rootDir, appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': path.join(rootDir, 'src') }, dedupe: ['react', 'react-dom'] },
    esbuild: { jsx: 'automatic' },
    define: {
      'import.meta.env.BASE_URL': JSON.stringify('/'),
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(
        `pk_test_${Buffer.from('profile-tests.clerk.accounts.dev$').toString('base64')}`),
      'import.meta.env.VITE_CLERK_PROXY_URL': 'undefined',
    },
  });
  try {
    const { ProfileForm, SettingsProfileForm } = await server.ssrLoadModule('/src/App.tsx') as typeof import('../App');
    // Both modules must share Vite's instance of the form-owner context.
    const { AccountQueries } = await server.ssrLoadModule('/src/components/account-queries.tsx') as typeof import('./account-queries');
    await t.test('konfirmasi bertahan setelah cache meremount draf, bukan setelah penolakan atau pergantian akun', async () => {
      let stored: Profile = {
        userId: 'settings-owner-a', displayName: 'Nama awal',
        role: 'kontraktor', organizationName: 'Organisasi awal',
      };
      let reject = false;
      let delay = false;
      let finishRequest: (() => void) | undefined;
      const requests: RequestInit[] = [];
      globals.fetch = async (url, init) => {
        assert.equal(url, '/api/me');
        assert.equal(new Headers(init?.headers).get('X-SBU-Form-Owner'), stored.userId);
        if (init?.method !== 'PATCH') return Response.json(stored);
        requests.push(init);
        if (delay) await new Promise<void>(resolve => { finishRequest = resolve; });
        if (reject) return Response.json({ error: 'Perubahan ditolak' }, { status: 403 });
        stored = { ...stored, ...JSON.parse(String(init.body)) };
        return Response.json(stored);
      };
      let client!: ReturnType<typeof useQueryClient>;
      function Settings({ owner }: { owner: string }) {
        client = useQueryClient();
        const me = useGetMe({ request: { headers: { 'X-SBU-Form-Owner': owner } } });
        return me.data ? createElement(SettingsProfileForm, { profile: me.data }) : null;
      }
      const container = window.document.createElement('div');
      window.document.body.appendChild(container);
      const root = createRoot(container as unknown as HTMLElement);
      const render = async (owner: string) => {
        await act(async () => {
          root.render(createElement(AccountQueries, {
            key: owner, userId: owner,
            children: createElement(Router, {
              hook: (): [string, () => void] => ['/settings', () => {}],
              children: createElement(Settings, { owner }),
            }),
          }));
        });
      };
      const waitFor = async (predicate: () => boolean) => {
        const deadline = Date.now() + 2000;
        while (!predicate()) {
          assert.ok(Date.now() < deadline, 'tampilan pengaturan harus selesai diperbarui');
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
        }
      };
      const input = (id: string) => {
        const element = container.querySelector(`[data-testid="${id}"]`);
        assert.ok(element instanceof window.HTMLInputElement);
        return element;
      };
      const setInput = async (id: string, value: string) => {
        await act(async () => {
          const element = input(id);
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
          element.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
      };
      const click = async (id: string) => {
        await act(async () => {
          const button = container.querySelector(`[data-testid="${id}"]`);
          assert.ok(button instanceof window.HTMLButtonElement);
          button.click();
        });
      };
      const status = () => container.querySelector('[role="status"]');
      try {
        await render(stored.userId);
        await waitFor(() => !!container.querySelector('form'));
        assert.equal(status(), null);
        for (const change of ['name', 'organization', 'role']) {
          const oldForm = container.querySelector('form');
          if (change === 'name') await setInput('input-display-name', '  Nama baru  ');
          if (change === 'organization') await setInput('input-organization', '  Organisasi baru  ');
          if (change === 'role') await click('button-role-konsultan');
          await click('button-save-profile');
          await waitFor(() => !client.isMutating() && !!status());
          assert.equal(status()?.textContent, 'Profil berhasil disimpan.');
          assert.notEqual(container.querySelector('form'), oldForm, 'respons baru tetap mengisi ulang draf');
          assert.equal(input('input-display-name').value, stored.displayName);
          assert.equal(input('input-organization').value, stored.organizationName);
          assert.deepEqual(client.getQueryData(getGetMeQueryKey()), stored);
          assert.equal(stored.role, change === 'role' ? 'konsultan' : 'kontraktor');
        }
        assert.equal(stored.displayName, 'Nama baru');
        assert.equal(stored.organizationName, 'Organisasi baru');
        assert.equal(requests.length, 3);
        // A fresh read must retain the server's saved values and the confirmation.
        await act(async () => { await client.refetchQueries({ queryKey: getGetMeQueryKey() }); });
        assert.equal(input('input-display-name').value, 'Nama baru');
        assert.ok(status());

        reject = true;
        delay = true;
        const saved = { ...stored };
        await setInput('input-display-name', 'Nama ditolak');
        await click('button-save-profile');
        await waitFor(() => !!finishRequest);
        assert.equal(status(), null, 'konfirmasi lama hilang saat mulai menyimpan lagi');
        await act(async () => { finishRequest!(); });
        await waitFor(() => !!container.querySelector('[role="alert"]'));
        assert.equal(status(), null, 'respons ditolak tidak boleh menampilkan sukses');
        assert.deepEqual(stored, saved);
        assert.deepEqual(client.getQueryData(getGetMeQueryKey()), saved);

        reject = false;
        delay = false;
        await click('button-save-profile');
        await waitFor(() => !!status());
        // Even a direct owner-prop change must discard feedback and old inputs.
        await act(async () => {
          client.setQueryData(getGetMeQueryKey(), { ...stored, userId: 'settings-owner-b', displayName: 'Nama akun B' });
        });
        await waitFor(() => input('input-display-name').value === 'Nama akun B');
        assert.equal(status(), null);
        // The normal identity-keyed cache boundary must do the same.
        stored = { ...stored, userId: 'settings-owner-b', displayName: 'Nama akun B' };
        await render(stored.userId);
        await waitFor(() => !!container.querySelector('form'));
        assert.equal(input('input-display-name').value, 'Nama akun B');
        assert.equal(status(), null);
        await click('button-save-profile');
        await waitFor(() => !!status());
        assert.equal(new Headers(requests.at(-1)?.headers).get('X-SBU-Form-Owner'), 'settings-owner-b');
      } finally {
        await act(async () => { root.unmount(); });
        container.remove();
      }
    });
    for (const onboarding of [true, false]) {
      for (const joinedName of ['می\u200cنا', 'क्\u200dष']) {
        await t.test(`${onboarding ? 'onboarding' : 'pengaturan'}: ${JSON.stringify(joinedName)}`, async () => {
          const profile: Profile = {
            userId: 'profile-test-owner', displayName: onboarding ? '' : 'Nama lama',
            role: onboarding ? 'belum_dipilih' : 'konsultan', organizationName: 'Organisasi uji',
          };
          const requests: { url: unknown; init?: RequestInit }[] = [];
          let saved: Profile | undefined;
          globals.fetch = async (url, init) => {
            requests.push({ url, init });
            assert.equal(url, '/api/me', 'uji tidak boleh mengakses layanan luar');
            assert.equal(init?.method, 'PATCH');
            assert.equal(new Headers(init.headers).get('X-SBU-Form-Owner'), profile.userId);
            const data = JSON.parse(String(init.body));
            saved = { ...profile, ...data };
            return Response.json(saved);
          };
          const navigations: string[] = [];
          let client!: ReturnType<typeof useQueryClient>;
          function Form() {
            client = useQueryClient();
            return createElement(ProfileForm, { profile, onboarding });
          }
          const container = window.document.createElement('div');
          window.document.body.appendChild(container);
          const root = createRoot(container as unknown as HTMLElement);
          const field = () => {
            const input = container.querySelector('[data-testid="input-display-name"]');
            assert.ok(input instanceof window.HTMLInputElement);
            return input;
          };
          const button = () => {
            const element = container.querySelector('[data-testid="button-save-profile"]');
            assert.ok(element instanceof window.HTMLButtonElement);
            return element;
          };
          const form = () => {
            const element = container.querySelector('form');
            assert.ok(element instanceof window.HTMLFormElement);
            return element;
          };
          const setName = async (value: string) => {
            await act(async () => {
              // Use the native setter so React sees a genuine controlled input change.
              const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
              setter.call(field(), value);
              field().dispatchEvent(new window.Event('input', { bubbles: true }));
            });
            assert.equal(field().value, value);
          };
          const submitWithEnter = async () => {
            await act(async () => {
              field().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              // Happy DOM does not implement implicit submission on keydown.
              // Explicitly exercise the resulting submit event, even when the
              // disabled default button would prevent native Enter submission.
              form().requestSubmit();
              field().dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
            });
          };
          try {
            await act(async () => {
              root.render(createElement(AccountQueries, {
                userId: profile.userId,
                children: createElement(Router, {
                  hook: () => [onboarding ? '/onboarding' : '/settings', path => navigations.push(path)],
                  children: createElement(Form),
                }),
              }));
            });
            assert.match(button().textContent!, onboarding ? /Masuk ke ruang kerja/ : /Simpan perubahan/);
            client.setQueryData(getGetMeQueryKey(), profile);
            for (const invisible of ['\u200b', '\u200c\u200d', ' \u200b\u200c\u200d ']) {
              await setName(invisible);
              assert.equal(button().disabled, true, 'nama tak terlihat menonaktifkan tombol');
              assert.equal(field().getAttribute('aria-invalid'), 'true');
              await act(async () => { button().click(); });
              await submitWithEnter();
              assert.equal(requests.length, 0, 'klik maupun submit Enter tidak boleh mengirim PATCH');
              assert.deepEqual(client.getQueryData(getGetMeQueryKey()), profile);
              assert.deepEqual(navigations, []);
            }
            await setName(joinedName);
            assert.equal(button().disabled, false, 'nama valid mengaktifkan tombol kembali');
            assert.equal(field().getAttribute('aria-invalid'), 'false');
            assert.equal(container.querySelector('[role="alert"]'), null);
            if (onboarding) await submitWithEnter();
            else await act(async () => { button().click(); });
            const deadline = Date.now() + 2000;
            while (client.isMutating() || requests.length === 0 ||
              (onboarding ? navigations.length === 0 : !container.querySelector('[role="status"]'))) {
              assert.equal(container.querySelector('[role="alert"]'), null, 'penyimpanan tidak boleh gagal');
              assert.ok(Date.now() < deadline, 'penyimpanan profil harus selesai');
              await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
            }
            assert.equal(requests.length, 1, 'nama yang diperbaiki dikirim tepat sekali');
            assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
              displayName: joinedName, role: onboarding ? 'kontraktor' : 'konsultan',
              organizationName: profile.organizationName,
            });
            assert.equal(container.querySelector('[role="alert"]'), null, 'penyimpanan tidak boleh gagal');
            assert.equal(saved?.displayName, joinedName, 'ZWJ/ZWNJ tidak dihapus pada penyimpanan');
            assert.deepEqual(client.getQueryData(getGetMeQueryKey()), saved, 'respons tersimpan memperbarui profil');
            assert.equal(field().value, joinedName);
            assert.deepEqual(navigations, onboarding ? ['/dashboard'] : []);
            if (!onboarding) assert.match(container.querySelector('[role="status"]')?.textContent ?? '', /Profil berhasil disimpan/);
          } finally {
            await act(async () => { root.unmount(); });
            container.remove();
          }
        });
      }
    }
  } finally {
    await server.close();
    await window.happyDOM.abort();
    globals.window = previous.window;
    globals.document = previous.document;
    globals.fetch = previous.fetch;
    globals.IS_REACT_ACT_ENVIRONMENT = previous.actEnvironment;
  }
});
