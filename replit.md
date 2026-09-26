# Gustafta SBU Accelerator

Ruang kerja persiapan permohonan SBU baru dan perpanjangan untuk ekosistem jasa konstruksi Indonesia, dengan catatan bukti dan panduan awal yang dapat ditelusuri ke sumber aturan.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Kontrak API: `lib/api-spec/openapi.yaml`; handler: `artifacts/api-server/src/routes/sbu.ts`.
- Skema data: `lib/db/src/schema/sbu.ts`; evaluasi awal: `artifacts/api-server/src/lib/sbu-rules.ts`.
- Referensi dan batasan regulasi: `docs/regulatory-basis.md`.
- UI: `artifacts/gustafta-sbu/src/`.

## Architecture decisions

- Profil peran tidak membuktikan keanggotaan organisasi; data kasus dibatasi ke identitas akun pemilik, tanpa akses lintas akun. Jangan mengklaim fitur kolaborasi asosiasi hingga otorisasi organisasi dibangun.
- Bukti yang dicatat saat ini berupa deklarasi teks, bukan unggahan atau dokumen terverifikasi. Pemeriksaan adalah panduan persiapan; keputusan tetap pada penyelenggara sertifikasi.
- Perhitungan tenggat konversi tidak aktif karena surat pemberlakuan skema/SIJK belum tersedia dalam rujukan yang diunggah.

## Product

Empat peran dapat membentuk profil. Kontraktor/konsultan dapat membuat dan mengelola kasus persiapan SBU, mencatat bukti per kategori, serta melihat daftar pemeriksaan dan dasar aturannya. Area profesional/asosiasi masih pengenalan, belum berbagi akses kasus.

## User preferences

- Bahasa Indonesia.
- Teks cerah dan terbaca; pengguna menyukai pasangan hitam/gelap dengan aksen terang/biru.

## Gotchas

- Setelah mengubah OpenAPI, jalankan `pnpm --filter @workspace/api-spec run codegen`.
- Jangan mengubah status “kasus selesai persiapan” menjadi klaim SBU diterbitkan.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
