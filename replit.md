# Gustafta SBU Accelerator

Ruang kerja persiapan permohonan SBU baru dan perpanjangan untuk ekosistem jasa konstruksi Indonesia, dengan catatan bukti dan panduan awal yang dapat ditelusuri ke sumber aturan.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

### Batas kepercayaan domain autentikasi

- Domain Clerk hanya dipilih dari Host yang dinormalisasi dan diizinkan. Sumber daftar: domain publik terverifikasi `gustafta-sbu-accelerator.replit.app`, `REPLIT_DOMAINS` dari platform, dan `CLERK_ALLOWED_HOSTS` (hostname tambahan yang disetujui operator, dipisahkan koma; tanpa skema/path/wildcard). Domain alternatif sah harus didaftarkan di salah satu sumber tersebut. Localhost hanya diizinkan di luar produksi.
- `X-Forwarded-Host` dari klien langsung diabaikan, bukan bukti asal proxy. Bawaan tidak mempercayai alamat proxy mana pun. Bila edge mengubah Host menjadi alamat internal, operator harus menetapkan `CLERK_TRUSTED_PROXY_CIDRS` dengan alamat/CIDR peer socket edge yang diketahui, bukan IP dari header. Jangan memakai seluruh jaringan privat, loopback, hitungan hop, atau `0.0.0.0/0` sebagai pengganti identifikasi edge.
- Proxy yang dipercaya wajib **mengganti**, bukan menambahkan, `X-Forwarded-Host`. Header berantai/duplikat atau domain asing ditolak (421) sebelum SDK Clerk, proxy FAPI, dan akses data. `Host`/`X-Forwarded-Host` diseragamkan, `Forwarded` dihapus, dan protokol Clerk selalu HTTPS. Pemeriksaan kesehatan `/api/healthz` tidak melibatkan Clerk atau data privat.
- Dokumentasi platform memastikan keberadaan header forwarding, tetapi bukan jaminan provenance ataupun rentang IP edge. Jangan memperluas kepercayaan berdasarkan asumsi tersebut. Perubahan ini tidak mempublikasikan aplikasi atau mengubah konfigurasi produksi.

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
- Deklarasi bukti tetap berupa catatan teks. Dokumen asli dapat diunggah sebagai lampiran privat, tetapi unggahan tidak otomatis menjadi deklarasi, tidak mengubah status kesiapan, dan tidak berarti terverifikasi. Keputusan tetap pada penyelenggara sertifikasi.
- Perhitungan tenggat konversi nonaktif secara bawaan. Tanggal hanya muncul pada temuan perpanjangan untuk alur yang punya sumber penerbit resmi berstatus berlaku, disahkan penelaah yang diizinkan, dan ditelaah ahli skema/LSBU yang teridentifikasi. Catatan bukti pemohon tidak dapat melakukan verifikasi ini.
- Produk independen, tidak terafiliasi atau mewakili Ditjen Bina Konstruksi, LPJK, Kementerian PU maupun LSBU; jangan membangun alur komunikasi dengan instansi atau mengklaim verifikasi SIJK/status regulasi dari mereka. Rujukan resmi hanya dicatat bila tersedia secara independen dan dapat diperiksa.

## Penelaahan sumber transisi

- Tetapkan `SBU_VERIFIER_USER_IDS` (daftar ID akun Clerk yang dipercaya, dipisahkan koma) pada lingkungan server sebelum penelaah dapat menggunakan API. Bila kosong, seluruh akses catatan verifikasi ditolak. Jangan memberikan akses hanya berdasarkan peran profil yang dapat dipilih sendiri.
- Penelaah masuk dengan akun yang diizinkan lalu menggunakan `GET /api/transition-verifications` untuk melihat catatan, dan `PUT /api/transition-verifications/{track}` untuk mengganti catatan lengkap satu alur (`transisi`, `transisi_operasional`, atau `transisi_konversi`). Kontrak isian ada di `lib/api-spec/openapi.yaml`: penerbit, URL HTTPS sumber resmi, nomor, penandatangan, tanggal terbit, cakupan, status surat, hasil pemeriksaan sumber, serta identitas, organisasi, tanggal dan isi telaah ahli. Penelaah harus memeriksa dokumen dari penerbit dan kesesuaian cakupannya secara independen; alamat URL atau klaim pengguna sendiri bukan bukti.
- Set `sourceVerified: true` hanya setelah pemeriksaan penerbit dan `expertApproved: true` hanya setelah telaah ahli yang teridentifikasi mendukung alur itu. Status `dicabut` / `belum_terkonfirmasi` atau salah satu persetujuan `false` segera menyembunyikan tanggal pada penilaian berikutnya. Data verifikasi belum memuat dokumen aktual dan tidak mewakili konfirmasi langsung dari instansi.

## Product

Empat peran dapat membentuk profil. Kontraktor/konsultan dapat membuat dan mengelola kasus persiapan SBU, mencatat bukti per kategori, serta melihat daftar pemeriksaan dan dasar aturannya. Area profesional/asosiasi masih pengenalan, belum berbagi akses kasus.

## Arsitektur fondasi blueprint

- Stack tetap React/Vite + Express + PostgreSQL/Drizzle + Clerk. Ruang kerja privat di database aplikasi tidak memakai Clerk Organizations dan belum membuka kolaborasi tim.
- `sbu_workspaces` mengikat satu ruang kerja privat ke identitas pemilik. `sbu_clients` memiliki wadah bawaan; kasus lama dan baru memperoleh `client_id` tanpa mengubah pemilik, nama badan usaha, tanggal, status, atau kualifikasi lama.
- Wadah bawaan bernama “Wadah kasus pribadi” bukan profil badan usaha yang terverifikasi. Kasus lama dapat mewakili badan usaha berbeda; jangan menggabungkan identitas perusahaan atau mengisi NIB/NPWP/alamat dari dugaan.
- `getContext(req)` mengambil identitas sesi dan memuat ruang kerja serta daftar wadah miliknya. Semua rute kasus tetap memeriksa `owner_id`; peran profil, ID klien, dan header organisasi tidak memberi akses ke akun lain.
- Audit CRUD kasus disimpan dalam transaksi yang sama dengan mutasi. Ringkasan audit hanya mencatat nama field yang berubah, bukan isi dokumen, catatan bukti, atau salinan data perusahaan.
- Migrasi aditif dan backfill: `pnpm --filter @workspace/db run migrate:workspace`. Server menjalankannya sebelum mulai melayani permintaan; kegagalan migrasi menghentikan startup. Jangan menjalankan migrasi produksi manual untuk database Replit; publikasi mengikuti alur migrasi platform.
- `sbu_app_settings` memuat teks deklarasi; batas minimum independensi tidak dapat dihapus oleh nilai setting. Disclaimer global juga tampil pada halaman publik dan privat.

## Rujukan framework lanjutan

- Framework SBU Accelerator 2.0 melengkapi blueprint; penyesuaian dan batas penerapannya tercatat di `docs/blueprint-adoption.md`. Fitur agentic, OCR, simulator, dan pemantauan pasca-terbit belum diaktifkan.
- Keputusan produk terbaru pengguna pada 9 Oktober 2026: SBU Accelerator adalah aplikasi mandiri yang terpisah dari Gustafta.my.id, termasuk penyimpanan dokumen asli di aplikasi SBU. Integrasi dengan Gustafta.my.id/Ruang Simpan dibatalkan untuk fase saat ini. Integrasi baru dipertimbangkan pada fase pengembangan berikutnya setelah SBU Accelerator dan Gustafta sama-sama teruji dalam praktik penggunaan nyata. Ini menggantikan rencana integrasi setelah sekadar dianggap matang dan keputusan lama bahwa dokumen asli hanya disimpan di Ruang Simpan.
- Konsep fitur Gustafta yang relevan—Ruang Simpan, Bedah Dokumen, Klinik Konsultasi, Workroom, dan fitur pendukung lain—dikembangkan langsung di SBU Accelerator. Ini adalah arah produk, bukan klaim bahwa seluruh modul telah tersedia; rincian cakupannya tetap perlu ditentukan.
- Prinsip yang disetujui pengguna: pisahkan modul Ruang Simpan, Bedah Dokumen, Klinik Konsultasi, dan Workroom SBU dengan jelas; gunakan identitas dokumen yang stabil sejak awal. Jangan menggabungkan akun atau data antar aplikasi secara otomatis/tersembunyi. Integrasi tidak termasuk cakupan saat ini; hanya keputusan baru pengguna yang dapat membuka kembali pekerjaan tersebut.
- Profil perusahaan diisi langsung oleh pemilik dan tidak diimpor otomatis. Kode adaptor Ruang Simpan lama masih ada dan nonaktif secara bawaan; jangan mengaktifkan `SBU_RUANG_SIMPAN_ENABLED` atau melanjutkan pekerjaan integrasi/pengujian koneksi pemilik kedua tanpa instruksi baru pengguna.
- Berkas asli disimpan di App Storage privat; database hanya menyimpan metadata. Batas awal: PDF/PNG/JPG, 20 MiB per berkas, 20 dokumen per kasus, 200 MiB per pemilik. Penghapusan dokumen permanen memerlukan konfirmasi. Kasus yang masih mempunyai dokumen harus dikosongkan dokumennya dahulu.
- Untuk pengembangan lanjutan, aturan berversi yang ditelaah menentukan hasil; AI hanya membantu ekstraksi, penjelasan, dan draf. Hasil Bedah Dokumen dan Klinik Konsultasi harus ditandai sebagai bantuan awal yang memerlukan konfirmasi/peninjauan manusia, bukan keputusan final. Contoh aturan dengan placeholder atau sumber belum terverifikasi tidak boleh menjadi aturan aktif.

## User preferences

- Bahasa Indonesia.
- Teks cerah dan terbaca; pengguna menyukai pasangan hitam/gelap dengan aksen terang/biru.

## Gotchas

- Setelah mengubah OpenAPI, jalankan `pnpm --filter @workspace/api-spec run codegen`.
- Jangan mengubah status “kasus selesai persiapan” menjadi klaim SBU diterbitkan.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
