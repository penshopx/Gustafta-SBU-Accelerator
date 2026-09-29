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
- Perhitungan tenggat konversi nonaktif secara bawaan. Tanggal hanya muncul pada temuan perpanjangan untuk alur yang punya sumber penerbit resmi berstatus berlaku, disahkan penelaah yang diizinkan, dan ditelaah ahli skema/LSBU yang teridentifikasi. Catatan bukti pemohon tidak dapat melakukan verifikasi ini.
- Produk independen, tidak terafiliasi atau mewakili Ditjen Bina Konstruksi, LPJK, Kementerian PU maupun LSBU; jangan membangun alur komunikasi dengan instansi atau mengklaim verifikasi SIJK/status regulasi dari mereka. Rujukan resmi hanya dicatat bila tersedia secara independen dan dapat diperiksa.

## Penelaahan sumber transisi

- Tetapkan `SBU_VERIFIER_USER_IDS` (daftar ID akun Clerk yang dipercaya, dipisahkan koma) pada lingkungan server sebelum penelaah dapat menggunakan API. Bila kosong, seluruh akses catatan verifikasi ditolak. Jangan memberikan akses hanya berdasarkan peran profil yang dapat dipilih sendiri.
- Penelaah masuk dengan akun yang diizinkan lalu menggunakan `GET /api/transition-verifications` untuk melihat catatan, dan `PUT /api/transition-verifications/{track}` untuk mengganti catatan lengkap satu alur (`transisi`, `transisi_operasional`, atau `transisi_konversi`). Kontrak isian ada di `lib/api-spec/openapi.yaml`: penerbit, URL HTTPS sumber resmi, nomor, penandatangan, tanggal terbit, cakupan, status surat, hasil pemeriksaan sumber, serta identitas, organisasi, tanggal dan isi telaah ahli. Penelaah harus memeriksa dokumen dari penerbit dan kesesuaian cakupannya secara independen; alamat URL atau klaim pengguna sendiri bukan bukti.
- Set `sourceVerified: true` hanya setelah pemeriksaan penerbit dan `expertApproved: true` hanya setelah telaah ahli yang teridentifikasi mendukung alur itu. Status `dicabut` / `belum_terkonfirmasi` atau salah satu persetujuan `false` segera menyembunyikan tanggal pada penilaian berikutnya. Data verifikasi belum memuat dokumen aktual dan tidak mewakili konfirmasi langsung dari instansi.

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
