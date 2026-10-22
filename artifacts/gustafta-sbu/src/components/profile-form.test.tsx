import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import React, { act, createElement } from 'react';
import { Window as HappyWindow } from 'happy-dom';
import { createServer } from 'vite';
import { Route, Router, Switch } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
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
    await t.test('onboarding: respons PATCH terlambat tidak meninggalkan halaman tujuan setelah formulir dilepas', async () => {
      const profile: Profile = {
        userId: 'same-account-route-owner', displayName: 'Nama sebelum pergi',
        role: 'belum_dipilih', organizationName: 'Organisasi uji',
      };
      const requests: RequestInit[] = [];
      let release!: () => void;
      const responseGate = new Promise<void>(resolve => { release = resolve; });
      const saved: Profile = { ...profile, role: 'kontraktor' };
      globals.fetch = async (url, init) => {
        assert.equal(url, '/api/me', 'tidak boleh mengakses layanan luar');
        assert.equal(init?.method, 'PATCH');
        assert.equal(new Headers(init.headers).get('X-SBU-Form-Owner'), profile.userId);
        requests.push(init);
        await responseGate;
        return Response.json(saved);
      };
      let client!: ReturnType<typeof useQueryClient>;
      let saves = 0;
      let formMounts = 0;
      let formUnmounts = 0;
      function OnboardingForm() {
        React.useEffect(() => {
          formMounts++;
          return () => { formUnmounts++; };
        }, []);
        return createElement(ProfileForm, {
          profile, onboarding: true, onSaved: () => { saves++; },
        });
      }
      function Pages() {
        client = useQueryClient();
        return createElement(Switch, null,
          createElement(Route, { path: '/onboarding', component: OnboardingForm }),
          createElement(Route, { path: '/regulations' },
            createElement('main', { 'data-testid': 'destination-page' }, 'Halaman tujuan')),
          createElement(Route, { path: '/dashboard' },
            createElement('main', { 'data-testid': 'unexpected-dashboard' }, 'Dashboard')),
        );
      }
      const location = memoryLocation({ path: '/onboarding', record: true });
      const container = window.document.createElement('div');
      window.document.body.appendChild(container);
      const root = createRoot(container as unknown as HTMLElement);
      const waitFor = async (predicate: () => boolean) => {
        const deadline = Date.now() + 2000;
        while (!predicate()) {
          assert.ok(Date.now() < deadline, 'mutasi profil harus selesai setelah respons dilepas');
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
        }
      };
      try {
        await act(async () => {
          root.render(createElement(AccountQueries, {
            userId: profile.userId,
            children: createElement(Router, { hook: location.hook, children: createElement(Pages) }),
          }));
        });
        const originalClient = client;
        await act(async () => { client.setQueryData(getGetMeQueryKey(), profile); });
        const oldForm = container.querySelector('form');
        const oldButton = container.querySelector('[data-testid="button-save-profile"]');
        assert.ok(oldForm instanceof window.HTMLFormElement);
        assert.ok(oldButton instanceof window.HTMLButtonElement);
        await act(async () => { oldForm.requestSubmit(); });
        await waitFor(() => requests.length === 1);
        assert.equal(oldButton.disabled, true);
        assert.equal(client.isMutating(), 1, 'PATCH masih tertahan saat pengguna pergi');
        assert.equal(formMounts, 1);
        assert.equal(formUnmounts, 0);

        // Keep AccountQueries and its identity mounted; only the Router removes
        // the real ProfileForm imported from App.tsx.
        await act(async () => { location.navigate('/regulations'); });
        const destination = container.querySelector('[data-testid="destination-page"]');
        assert.ok(destination, 'halaman tujuan sudah terpasang sebelum respons dilepas');
        assert.equal(oldForm.isConnected, false);
        assert.equal(formUnmounts, 1, 'navigasi benar-benar melepas formulir, bukan menyembunyikannya');
        assert.equal(container.querySelector('form'), null);
        assert.equal(client, originalClient, 'akun dan cache tetap sama saat berpindah halaman');
        assert.equal(client.isMutating(), 1);
        assert.equal(saves, 0);

        await act(async () => { release(); });
        await waitFor(() => client.getMutationCache().getAll()[0]?.state.status === 'success');
        assert.deepEqual(client.getMutationCache().getAll()[0].state.data, saved,
          'respons sukses benar-benar diproses, bukan dibatalkan saat formulir dilepas');
        assert.equal(client.isMutating(), 0);
        assert.deepEqual(location.history, ['/onboarding', '/regulations'],
          'respons terlambat tidak boleh menavigasi ke dashboard');
        assert.equal(container.querySelector('[data-testid="destination-page"]'), destination,
          'halaman tujuan yang sama tetap terpasang');
        assert.equal(container.querySelector('[data-testid="unexpected-dashboard"]'), null);
        assert.equal(container.querySelector('form'), null);
        assert.equal(container.querySelector('[data-testid="input-display-name"]'), null);
        assert.equal(container.querySelector('[data-testid="button-save-profile"]'), null);
        assert.equal(oldForm.isConnected, false);
        assert.equal(formMounts, 1, 'formulir lama tidak muncul kembali');
        assert.equal(formUnmounts, 1);
        assert.equal(saves, 0, 'callback formulir yang sudah dilepas tidak dijalankan');
        assert.equal(client, originalClient);
        assert.equal(requests.length, 1, 'berpindah halaman dan respons terlambat tidak mengirim PATCH tambahan');
        assert.deepEqual(JSON.parse(String(requests[0].body)), {
          role: 'kontraktor', displayName: profile.displayName, organizationName: profile.organizationName,
        });
      } finally {
        await act(async () => { release(); });
        await act(async () => { root.unmount(); });
        container.remove();
      }
    });
    for (const onboarding of [true, false]) {
      for (const trigger of ['click', 'Enter'] as const) {
        await t.test(`${onboarding ? 'onboarding' : 'pengaturan'}: ${trigger} berulang selama PATCH tertahan hanya menyimpan sekali`, async () => {
          const profile: Profile = {
            userId: 'pending-profile-owner', displayName: 'Nama awal',
            role: onboarding ? 'belum_dipilih' : 'konsultan', organizationName: 'Organisasi uji',
          };
          const requests: RequestInit[] = [];
          const navigations: string[] = [];
          let starts = 0;
          let saves = 0;
          let saved: Profile | undefined;
          let release!: () => void;
          const responseGate = new Promise<void>(resolve => { release = resolve; });
          globals.fetch = async (url, init) => {
            assert.equal(url, '/api/me', 'tidak boleh mengakses layanan luar');
            assert.equal(init?.method, 'PATCH');
            assert.equal(new Headers(init.headers).get('X-SBU-Form-Owner'), profile.userId);
            requests.push(init);
            await responseGate;
            saved = { ...profile, ...JSON.parse(String(init.body)) };
            return Response.json(saved);
          };
          let client!: ReturnType<typeof useQueryClient>;
          function Form() {
            client = useQueryClient();
            return createElement(ProfileForm, {
              profile, onboarding,
              onSaveStart: () => { starts++; },
              onSaved: () => { saves++; },
            });
          }
          const container = window.document.createElement('div');
          window.document.body.appendChild(container);
          const root = createRoot(container as unknown as HTMLElement);
          const button = () => {
            const element = container.querySelector('[data-testid="button-save-profile"]');
            assert.ok(element instanceof window.HTMLButtonElement);
            return element;
          };
          const field = () => {
            const element = container.querySelector('[data-testid="input-display-name"]');
            assert.ok(element instanceof window.HTMLInputElement);
            return element;
          };
          const form = () => {
            const element = container.querySelector('form');
            assert.ok(element instanceof window.HTMLFormElement);
            return element;
          };
          const enter = () => {
            field().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            // Happy DOM has no implicit Enter submission. Exercise its resulting
            // submit event even when a browser would block a disabled submitter.
            form().requestSubmit();
            field().dispatchEvent(new window.KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
          };
          const waitFor = async (predicate: () => boolean) => {
            const deadline = Date.now() + 2000;
            while (!predicate()) {
              assert.ok(Date.now() < deadline, 'penyimpanan profil harus mencapai keadaan yang diharapkan');
              await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
            }
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
            await act(async () => {
              client.setQueryData(getGetMeQueryKey(), profile);
              Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(field(), '  Nama baru  ');
              field().dispatchEvent(new window.Event('input', { bubbles: true }));
            });
            assert.equal(button().disabled, false);
            await act(async () => {
              if (trigger === 'click') button().click();
              else enter();
              // Include submissions before React has committed isPending.
              button().click();
              enter();
              enter();
            });
            await waitFor(() => requests.length > 0 && button().disabled);
            assert.equal(client.isMutating(), 1);
            assert.equal(button().disabled, true, 'isPending menonaktifkan tombol');
            assert.match(button().textContent!, /Menyimpan\.\.\./);
            for (let attempt = 0; attempt < 3; attempt++) {
              await act(async () => { button().click(); enter(); });
            }
            assert.equal(requests.length, 1, 'klik dan Enter tidak boleh menambah PATCH tertahan');
            assert.equal(starts, 1);
            assert.equal(saves, 0, 'belum ada penyimpanan berhasil sebelum respons');
            assert.equal(saved, undefined);
            assert.deepEqual(client.getQueryData(getGetMeQueryKey()), profile);
            assert.deepEqual(navigations, [], 'tidak boleh navigasi sebelum respons');
            await act(async () => { release(); });
            await waitFor(() => !client.isMutating() && !button().disabled && saves === 1);
            assert.equal(requests.length, 1);
            assert.equal(starts, 1);
            assert.equal(saves, 1, 'respons sukses hanya memanggil penyimpanan sekali');
            assert.deepEqual(saved, {
              ...profile, displayName: 'Nama baru', role: onboarding ? 'kontraktor' : 'konsultan',
            });
            assert.deepEqual(client.getQueryData(getGetMeQueryKey()), saved);
            assert.deepEqual(navigations, onboarding ? ['/dashboard'] : []);
            assert.equal(container.querySelector('[role="alert"]'), null);
            assert.match(button().textContent!, onboarding ? /Masuk ke ruang kerja/ : /Simpan perubahan/);
          } finally {
            await act(async () => { release(); });
            await act(async () => { root.unmount(); });
            container.remove();
          }
        });
      }
    }
    for (const onboarding of [true, false]) {
      for (const { failure, editBeforeRetry } of (['network', '503'] as const).flatMap(failure =>
        [false, true].map(editBeforeRetry => ({ failure, editBeforeRetry })))) {
        await t.test(`${onboarding ? 'onboarding' : 'pengaturan'}: ${editBeforeRetry ? 'retry mengirim perubahan terbaru' : 'isian utuh dan retry berhasil'} setelah ${failure}`, async () => {
          const profile: Profile = {
            userId: 'retry-profile-owner', displayName: onboarding ? '' : 'Nama awal',
            role: onboarding ? 'belum_dipilih' : 'kontraktor', organizationName: 'Organisasi awal',
          };
          const draft = {
            displayName: 'می\u200cنا क्\u200dष', organizationName: 'Organisasi Nusantara 新',
            role: 'asosiasi',
          } as const;
          const revisedDraft = {
            displayName: 'Nama terbaru 新', organizationName: 'Organisasi terbaru Nusantara',
            role: 'konsultan',
          } as const;
          const retryDraft = editBeforeRetry ? revisedDraft : draft;
          const requests: RequestInit[] = [];
          const navigations: string[] = [];
          const releases: (() => void)[] = [];
          globals.fetch = async (url, init) => {
            assert.equal(url, '/api/me', 'uji tidak boleh mengakses layanan luar');
            assert.equal(init?.method, 'PATCH');
            assert.equal(new Headers(init.headers).get('X-SBU-Form-Owner'), profile.userId);
            requests.push(init);
            const attempt = requests.length;
            await new Promise<void>(resolve => { releases.push(resolve); });
            if (attempt === 1) {
              if (failure === 'network') throw new TypeError('Failed to fetch');
              return Response.json({ error: 'Layanan profil sementara tidak tersedia' }, { status: 503 });
            }
            assert.equal(attempt, 2, 'retry harus berasal dari satu pengiriman ulang pengguna');
            return Response.json({ ...profile, ...JSON.parse(String(init.body)) });
          };
          let client!: ReturnType<typeof useQueryClient>;
          function Form() {
            client = useQueryClient();
            return createElement(ProfileForm, { profile, onboarding });
          }
          const container = window.document.createElement('div');
          window.document.body.appendChild(container);
          const root = createRoot(container as unknown as HTMLElement);
          const input = (id: string) => {
            const element = container.querySelector(`[data-testid="${id}"]`);
            assert.ok(element instanceof window.HTMLInputElement);
            return element;
          };
          const button = (id = 'button-save-profile') => {
            const element = container.querySelector(`[data-testid="${id}"]`);
            assert.ok(element instanceof window.HTMLButtonElement);
            return element;
          };
          const waitFor = async (predicate: () => boolean) => {
            const deadline = Date.now() + 2000;
            while (!predicate()) {
              assert.ok(Date.now() < deadline, 'formulir harus selesai memproses respons');
              await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
            }
          };
          const editDraft = async (values: typeof draft | typeof revisedDraft) => {
            await act(async () => {
              for (const [id, value] of [
                ['input-display-name', values.displayName],
                ['input-organization', values.organizationName],
              ]) {
                const element = input(id);
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
                element.dispatchEvent(new window.Event('input', { bubbles: true }));
              }
              button(`button-role-${values.role}`).click();
            });
          };
          const assertDraft = (values: typeof draft | typeof revisedDraft = draft) => {
            assert.equal(input('input-display-name').value, values.displayName, 'nama tetap utuh');
            assert.equal(input('input-organization').value, values.organizationName);
            // The selected role is rendered with a check icon; inspect all
            // options so retaining the default role cannot pass this assertion.
            for (const role of ['kontraktor', 'konsultan', 'profesional', 'asosiasi']) {
              assert.equal(!!button(`button-role-${role}`).querySelector('svg'), role === values.role);
            }
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
            await act(async () => {
              client.setQueryData(getGetMeQueryKey(), profile);
            });
            await editDraft(draft);
            const updatesBeforeSave = client.getQueryState(getGetMeQueryKey())!.dataUpdateCount;
            const assertNoSuccess = () => {
              assert.deepEqual(client.getQueryData(getGetMeQueryKey()), profile);
              assert.equal(client.getQueryState(getGetMeQueryKey())!.dataUpdateCount, updatesBeforeSave,
                'cache tidak boleh diperbarui sebelum retry sukses');
              assert.deepEqual(navigations, []);
              assert.equal(container.querySelector('[role="status"]'), null);
            };
            assertDraft();
            await act(async () => { button().click(); });
            await waitFor(() => requests.length === 1 && button().disabled);
            assert.match(button().textContent!, /Menyimpan\.\.\./);
            assertNoSuccess();
            await act(async () => { releases[0](); });
            await waitFor(() => !client.isMutating() && !!container.querySelector('[role="alert"]'));
            assert.match(container.querySelector('[role="alert"]')!.textContent!,
              failure === 'network' ? /Failed to fetch/ : /Layanan profil sementara tidak tersedia/);
            assert.equal(button().disabled, false, 'tombol dapat dipakai lagi setelah gagal');
            assert.match(button().textContent!, onboarding ? /Masuk ke ruang kerja/ : /Simpan perubahan/);
            assertDraft();
            assertNoSuccess();
            assert.equal(requests.length, 1, 'kegagalan tidak memulai retry otomatis');

            assert.deepEqual(JSON.parse(String(requests[0].body)), draft,
              'PATCH pertama membawa isian sebelum kegagalan');
            if (editBeforeRetry) {
              // Edit the still-mounted real form only after PATCH has failed.
              await editDraft(revisedDraft);
              assertDraft(revisedDraft);
              assertNoSuccess();
              assert.equal(requests.length, 1, 'mengubah isian tidak otomatis mengirim PATCH');
              assert.equal(button().disabled, false);
            }
            // Retry through the real enabled button, using the current draft.
            await act(async () => { button().click(); });
            await waitFor(() => requests.length === 2 && button().disabled);
            assert.equal(container.querySelector('[role="alert"]'), null);
            assertDraft(retryDraft);
            assertNoSuccess();
            assert.deepEqual(JSON.parse(String(requests[0].body)), draft,
              'perubahan isian tidak mengubah salinan PATCH pertama');
            assert.deepEqual(JSON.parse(String(requests[1].body)), retryDraft,
              'PATCH kedua membawa isian terkini, bukan salinan pengiriman yang gagal');
            await act(async () => { releases[1](); });
            await waitFor(() => !client.isMutating() && !button().disabled &&
              (onboarding ? navigations.length === 1 : !!container.querySelector('[role="status"]')));
            assert.equal(requests.length, 2);
            assert.deepEqual(client.getQueryData(getGetMeQueryKey()), { ...profile, ...retryDraft });
            assert.equal(client.getQueryState(getGetMeQueryKey())!.dataUpdateCount, updatesBeforeSave + 1);
            assert.deepEqual(navigations, onboarding ? ['/dashboard'] : []);
            assert.equal(container.querySelector('[role="alert"]'), null);
            if (!onboarding) assert.match(container.querySelector('[role="status"]')!.textContent!, /Profil berhasil disimpan/);
            assertDraft(retryDraft);
          } finally {
            await act(async () => { root.unmount(); });
            await act(async () => { releases.forEach(release => release()); });
            container.remove();
          }
        });
      }
    }
    await t.test('pengaturan: dua perubahan berurutan tersimpan sekali masing-masing tanpa memuat ulang', async () => {
      let stored: Profile = {
        userId: 'settings-sequential-owner', displayName: 'Nama awal',
        role: 'kontraktor', organizationName: 'Organisasi awal',
      };
      const initial = { ...stored };
      const changes = [
        { displayName: 'Nama pertama', organizationName: 'Organisasi pertama', role: 'konsultan' as const },
        { displayName: 'Nama kedua', organizationName: 'Organisasi kedua', role: 'kontraktor' as const },
      ];
      const requests: RequestInit[] = [];
      let releaseSecond!: () => void;
      const secondResponse = new Promise<void>(resolve => { releaseSecond = resolve; });
      globals.fetch = async (url, init) => {
        assert.equal(url, '/api/me', 'tidak boleh mengakses layanan luar');
        assert.equal(new Headers(init?.headers).get('X-SBU-Form-Owner'), initial.userId);
        if (init?.method === 'PATCH') {
          requests.push(init);
          assert.ok(requests.length <= 2, 'setiap perubahan hanya boleh mengirim satu PATCH');
          if (requests.length === 2) await secondResponse;
          stored = { ...stored, ...JSON.parse(String(init.body)) };
        } else {
          assert.ok(!init?.method || init.method === 'GET');
        }
        return Response.json(stored);
      };
      let client!: ReturnType<typeof useQueryClient>;
      function Settings() {
        client = useQueryClient();
        const me = useGetMe({ request: { headers: { 'X-SBU-Form-Owner': initial.userId } } });
        return me.data ? createElement(SettingsProfileForm, { profile: me.data }) : null;
      }
      const container = window.document.createElement('div');
      window.document.body.appendChild(container);
      const root = createRoot(container as unknown as HTMLElement);
      const location = memoryLocation({ path: '/settings', record: true });
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
      const input = (id: string) => {
        const element = container.querySelector(`[data-testid="${id}"]`);
        assert.ok(element instanceof window.HTMLInputElement);
        return element;
      };
      const status = () => container.querySelector('[role="status"]');
      const waitFor = async (predicate: () => boolean) => {
        const deadline = Date.now() + 2000;
        while (!predicate()) {
          assert.ok(Date.now() < deadline, 'dua penyimpanan profil harus selesai');
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
        }
      };
      const edit = async (change: typeof changes[number]) => {
        await act(async () => {
          for (const [id, value] of [
            ['input-display-name', change.displayName],
            ['input-organization', change.organizationName],
          ]) {
            const element = input(id);
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
            element.dispatchEvent(new window.Event('input', { bubbles: true }));
          }
          const role = container.querySelector(`[data-testid="button-role-${change.role}"]`);
          assert.ok(role instanceof window.HTMLButtonElement);
          role.click();
        });
      };
      try {
        // Mount the settings page once; /me updates must reach it through the
        // actual mutation cache write, not a manual setQueryData or rerender.
        await act(async () => {
          root.render(createElement(AccountQueries, {
            userId: initial.userId,
            children: createElement(Router, { hook: location.hook, children: createElement(Settings) }),
          }));
        });
        await waitFor(() => !!container.querySelector('form'));
        const originalClient = client;
        const liveRegion = status();
        assert.ok(liveRegion);
        await edit(changes[0]);
        await act(async () => { button().click(); });
        await waitFor(() => !client.isMutating() && !button().disabled && !!status()?.textContent);
        const firstSaved = { ...initial, ...changes[0] };
        assert.equal(requests.length, 1);
        assert.deepEqual(JSON.parse(String(requests[0].body)), changes[0]);
        assert.deepEqual(stored, firstSaved);
        assert.deepEqual(client.getQueryData(getGetMeQueryKey()), firstSaved);
        assert.equal(status()?.textContent, 'Profil berhasil disimpan.');
        assert.equal(input('input-display-name').value, changes[0].displayName);
        assert.equal(input('input-organization').value, changes[0].organizationName);

        await edit(changes[1]);
        assert.equal(button().disabled, false, 'tombol dapat dipakai lagi setelah sukses pertama');
        await act(async () => {
          button().click();
          button().click();
          form().requestSubmit();
        });
        await waitFor(() => requests.length === 2 && button().disabled);
        assert.equal(client.isMutating(), 1, 'pengunci pertama sudah dilepas sehingga PATCH kedua dimulai');
        assert.match(button().textContent!, /Menyimpan\.\.\./);
        assert.equal(status()?.textContent, '', 'konfirmasi pertama tidak berlaku saat simpan kedua berlangsung');
        for (let attempt = 0; attempt < 3; attempt++) {
          // Happy DOM lacks implicit Enter submission; requestSubmit exercises
          // the submit handler even when the pending submitter is disabled.
          await act(async () => { button().click(); form().requestSubmit(); });
        }
        assert.equal(requests.length, 2, 'klik dan submit berulang tidak menggandakan PATCH kedua');
        assert.deepEqual(JSON.parse(String(requests[1].body)), changes[1]);
        assert.deepEqual(stored, firstSaved, 'respons kedua masih ditahan');
        assert.deepEqual(client.getQueryData(getGetMeQueryKey()), firstSaved);
        assert.equal(button().disabled, true, 'tombol kembali nonaktif selama PATCH kedua');
        await act(async () => { releaseSecond(); });
        await waitFor(() => !client.isMutating() && !button().disabled && !!status()?.textContent);
        const secondSaved = { ...initial, ...changes[1] };
        assert.equal(requests.length, 2);
        assert.deepEqual(stored, secondSaved);
        assert.deepEqual(client.getQueryData(getGetMeQueryKey()), secondSaved);
        assert.equal(input('input-display-name').value, changes[1].displayName);
        assert.equal(input('input-organization').value, changes[1].organizationName);
        const selectedRole = container.querySelector('[data-testid="button-role-kontraktor"]');
        assert.ok(selectedRole?.querySelector('svg'), 'peran akhir mengikuti perubahan kedua');
        assert.equal(status()?.textContent, 'Profil berhasil disimpan.');
        assert.ok(status() === liveRegion, 'konfirmasi akhir memakai area pengumuman halaman yang sama');
        assert.ok(client === originalClient, 'dua penyimpanan memakai cache yang sama tanpa muat ulang');
        assert.deepEqual(location.history, ['/settings'], 'tidak ada navigasi di antara penyimpanan');
        assert.equal(container.querySelector('[role="alert"]'), null);
        assert.match(button().textContent!, /Simpan perubahan/);
      } finally {
        await act(async () => { releaseSecond(); });
        await act(async () => { root.unmount(); });
        container.remove();
      }
    });
    for (const cycle of ['navigasi', 'muat ulang'] as const) {
      await t.test(`pengaturan: ${cycle} setelah simpan mempertahankan nilai tanpa mengulang konfirmasi`, async () => {
        let stored: Profile = {
          userId: 'settings-navigation-owner', displayName: 'Nama awal',
          role: 'kontraktor', organizationName: 'Organisasi awal',
        };
        let reads = 0;
        let patches = 0;
        globals.fetch = async (url, init) => {
          assert.equal(url, '/api/me');
          assert.equal(new Headers(init?.headers).get('X-SBU-Form-Owner'), stored.userId);
          if (init?.method === 'PATCH') {
            patches++;
            stored = { ...stored, ...JSON.parse(String(init.body)) };
          } else {
            reads++;
          }
          return Response.json(stored);
        };
        let client!: ReturnType<typeof useQueryClient>;
        function Settings() {
          client = useQueryClient();
          const me = useGetMe({ request: { headers: { 'X-SBU-Form-Owner': stored.userId } } });
          return me.data ? createElement(SettingsProfileForm, { profile: me.data }) : null;
        }
        const container = window.document.createElement('div');
        window.document.body.appendChild(container);
        let root = createRoot(container as unknown as HTMLElement);
        const location = memoryLocation({ path: '/settings' });
        const mount = async () => {
          await act(async () => {
            root.render(createElement(AccountQueries, {
              userId: stored.userId,
              children: createElement(Router, {
                hook: location.hook,
                children: createElement(Switch, null,
                  createElement(Route, { path: '/settings', component: Settings }),
                  createElement(Route, { path: '/dashboard' }, 'Ringkasan uji'),
                ),
              }),
            }));
          });
        };
        const waitFor = async (predicate: () => boolean) => {
          const deadline = Date.now() + 2000;
          while (!predicate()) {
            assert.ok(Date.now() < deadline, 'siklus halaman pengaturan harus selesai');
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
          }
        };
        const input = (id: string) => {
          const element = container.querySelector(`[data-testid="${id}"]`);
          assert.ok(element instanceof window.HTMLInputElement);
          return element;
        };
        const status = () => container.querySelector('[role="status"]');
        const reopenedMessages: string[] = [];
        // Watch from before reopening, including transient/deferred announcements.
        const observer = new window.MutationObserver(() => {
          if (status()?.textContent) reopenedMessages.push(status()!.textContent!);
        });
        try {
          await mount();
          await waitFor(() => !!container.querySelector('form'));
          await act(async () => {
            for (const [id, value] of [
              ['input-display-name', 'Nama tersimpan'],
              ['input-organization', 'Organisasi tersimpan'],
            ]) {
              const element = input(id);
              Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
              element.dispatchEvent(new window.Event('input', { bubbles: true }));
            }
            const role = container.querySelector('[data-testid="button-role-konsultan"]');
            assert.ok(role instanceof window.HTMLButtonElement);
            role.click();
          });
          await act(async () => {
            const save = container.querySelector('[data-testid="button-save-profile"]');
            assert.ok(save instanceof window.HTMLButtonElement);
            save.click();
          });
          await waitFor(() => !client.isMutating() && status()?.textContent === 'Profil berhasil disimpan.');
          assert.equal(patches, 1, 'siklus dimulai dari penyimpanan yang benar-benar berhasil');
          assert.equal(stored.displayName, 'Nama tersimpan');
          assert.equal(stored.organizationName, 'Organisasi tersimpan');
          assert.equal(stored.role, 'konsultan');
          const previousClient = client;
          const previousReads = reads;
          if (cycle === 'navigasi') {
            await act(async () => { location.navigate('/dashboard'); });
            assert.equal(container.textContent, 'Ringkasan uji');
            assert.equal(container.querySelector('form'), null);
            assert.equal(status(), null, 'halaman pengaturan benar-benar dilepas');
            observer.observe(container, { subtree: true, childList: true, characterData: true });
            await act(async () => { location.navigate('/settings'); });
          } else {
            // Model a reload by discarding the entire React tree and query cache.
            // Only the intercepted server profile survives, not client state.
            await act(async () => { root.unmount(); });
            root = createRoot(container as unknown as HTMLElement);
            observer.observe(container, { subtree: true, childList: true, characterData: true });
            await mount();
          }
          await waitFor(() => !!container.querySelector('form'));
          assert.equal(input('input-display-name').value, 'Nama tersimpan');
          assert.equal(input('input-organization').value, 'Organisasi tersimpan');
          assert.ok(container.querySelector('[data-testid="button-role-konsultan"] svg'),
            'peran tersimpan tetap dipilih');
          assert.deepEqual(client.getQueryData(getGetMeQueryKey()), stored);
          assert.ok(status(), 'area pengumuman tetap tersedia');
          assert.equal(status()?.textContent, '', 'konfirmasi lama tidak dianggap hasil simpan baru');
          if (cycle === 'navigasi') {
            assert.ok(client === previousClient, 'navigasi mempertahankan cache akun');
          } else {
            assert.ok(client !== previousClient, 'muat ulang membuat cache baru');
            assert.ok(reads > previousReads, 'muat ulang mengambil nilai dari server');
          }
          await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
          assert.equal(status()?.textContent, '', 'konfirmasi juga tidak muncul setelah timer pengumuman');
          assert.deepEqual(reopenedMessages, [], 'tidak ada pengumuman sukses saat halaman dibuka ulang');
          assert.equal(patches, 1, 'membuka ulang tidak mengirim penyimpanan baru');
        } finally {
          observer.disconnect();
          await act(async () => { root.unmount(); });
          container.remove();
        }
      });
    }
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
        const liveRegion = status()!;
        assert.ok(liveRegion, 'area pengumuman harus terpasang sebelum ada pesan');
        assert.equal(liveRegion.textContent, '');
        assert.equal(liveRegion.getAttribute('aria-live'), 'polite');
        assert.equal(liveRegion.getAttribute('aria-atomic'), 'true');
        const announcements: string[] = [];
        // Observe the live-region update contract, not merely its final markup.
        // This is not a substitute for listening with a real screen reader.
        const observer = new window.MutationObserver(() => {
          if (liveRegion.textContent) announcements.push(liveRegion.textContent);
        });
        observer.observe(liveRegion, { childList: true, characterData: true, subtree: true });
        t.after(() => observer.disconnect());
        for (const change of ['name', 'organization', 'role', 'unchanged', 'unchanged']) {
          const oldForm = container.querySelector('form');
          if (change === 'name') await setInput('input-display-name', '  Nama baru  ');
          if (change === 'organization') await setInput('input-organization', '  Organisasi baru  ');
          if (change === 'role') await click('button-role-konsultan');
          const count = announcements.length;
          await click('button-save-profile');
          assert.equal(status(), liveRegion, 'area pengumuman tidak boleh ikut diremount');
          assert.equal(status()?.textContent, '', 'teks lama dikosongkan sebelum sukses berikutnya');
          await waitFor(() => !client.isMutating() && !!status()?.textContent);
          await waitFor(() => announcements.length > count);
          assert.equal(announcements.length, count + 1, 'satu perubahan pengumuman per simpan');
          assert.equal(container.querySelectorAll('[role="status"]').length, 1);
          assert.equal(status()?.textContent, 'Profil berhasil disimpan.');
          if (change !== 'unchanged') assert.notEqual(container.querySelector('form'), oldForm, 'respons baru tetap mengisi ulang draf');
          assert.equal(status(), liveRegion, 'pengumuman tetap memakai area yang sudah terpasang');
          assert.equal(input('input-display-name').value, stored.displayName);
          assert.equal(input('input-organization').value, stored.organizationName);
          assert.deepEqual(client.getQueryData(getGetMeQueryKey()), stored);
          assert.equal(stored.role, ['role', 'unchanged'].includes(change) ? 'konsultan' : 'kontraktor');
        }
        assert.equal(stored.displayName, 'Nama baru');
        assert.equal(stored.organizationName, 'Organisasi baru');
        assert.equal(requests.length, 5);
        // A fresh read must retain the server's saved values and the confirmation.
        await act(async () => { await client.refetchQueries({ queryKey: getGetMeQueryKey() }); });
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
        assert.equal(input('input-display-name').value, 'Nama baru');
        assert.equal(status(), liveRegion);
        assert.equal(status()?.textContent, 'Profil berhasil disimpan.');
        assert.equal(announcements.length, 5, 'refetch tidak mengumumkan ulang sukses');

        reject = true;
        delay = true;
        const saved = { ...stored };
        await setInput('input-display-name', 'Nama ditolak');
        await click('button-save-profile');
        await waitFor(() => !!finishRequest);
        assert.equal(status()?.textContent, '', 'konfirmasi lama hilang saat mulai menyimpan lagi');
        await act(async () => { finishRequest!(); });
        await waitFor(() => !!container.querySelector('[role="alert"]'));
        assert.equal(status()?.textContent, '', 'respons ditolak tidak boleh menampilkan sukses');
        assert.equal(announcements.length, 5);
        assert.deepEqual(stored, saved);
        assert.deepEqual(client.getQueryData(getGetMeQueryKey()), saved);

        reject = false;
        delay = false;
        await click('button-save-profile');
        await waitFor(() => !!status()?.textContent);
        // Even a direct owner-prop change must discard feedback and old inputs.
        await act(async () => {
          client.setQueryData(getGetMeQueryKey(), { ...stored, userId: 'settings-owner-b', displayName: 'Nama akun B' });
        });
        await waitFor(() => input('input-display-name').value === 'Nama akun B');
        assert.equal(status()?.textContent, '');
        // The normal identity-keyed cache boundary must do the same.
        stored = { ...stored, userId: 'settings-owner-b', displayName: 'Nama akun B' };
        await render(stored.userId);
        await waitFor(() => !!container.querySelector('form'));
        assert.equal(input('input-display-name').value, 'Nama akun B');
        assert.equal(status()?.textContent, '');
        await click('button-save-profile');
        await waitFor(() => !!status()?.textContent);
        assert.equal(new Headers(requests.at(-1)?.headers).get('X-SBU-Form-Owner'), 'settings-owner-b');
        // Switch owners after success but before the deferred announcement.
        await click('button-save-profile');
        await waitFor(() => !client.isMutating());
        assert.equal(status()?.textContent, '');
        await act(async () => {
          client.setQueryData(getGetMeQueryKey(), { ...stored, userId: 'settings-owner-c', displayName: 'Nama akun C' });
        });
        await waitFor(() => input('input-display-name').value === 'Nama akun C');
        const nextRegion = status();
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 150)); });
        assert.ok(status() === nextRegion, 'area pengumuman akun baru tidak diganti lagi');
        assert.equal(status()?.textContent, '', 'timer akun sebelumnya dibatalkan tanpa pengumuman terlambat');
        observer.disconnect();
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
