# Gustafta SBU Accelerator

Ruang kerja persiapan permohonan SBU baru dan perpanjangan untuk ekosistem jasa konstruksi Indonesia, dengan catatan bukti dan panduan awal yang dapat ditelusuri ke sumber aturan.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/gustafta-sbu run typecheck` — bangun ulang deklarasi klien API sebelum memeriksa frontend, termasuk saat `dist` lama masih ada.
- `pnpm --filter @workspace/gustafta-sbu run test:typecheck` — regresi checkout bersih, deklarasi Regulation lama, codegen, kegagalan tipe nyata, dan urutan post-merge; tidak menjalankan operasi database.
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

### Validasi otomatis sebelum penggabungan

- `scripts/post-merge.sh` menjalankan instalasi, lalu codegen beserta pembangunan ulang deklarasi library sebelum langkah database yang sudah ada. Codegen memakai `--force` agar metadata incremental tidak mempertahankan deklarasi lama.
- Batas waktu post-merge adalah 120 detik untuk menampung instalasi, regenerasi, dan langkah persiapan yang sudah ada.
- `frontend-typecheck-regression`: `pnpm --filter @workspace/gustafta-sbu run test:typecheck` — validasi proyek untuk urutan persiapan frontend dan pemulihan deklarasi lama.

- `api-typecheck-regression`: `pnpm --filter @workspace/api-server test:typecheck` — uji sumber checkout bersih, deklarasi tertinggal, pengulangan incremental, larangan keluaran kode API, dan penolakan kesalahan tipe.
- `api-typecheck`: `pnpm --filter @workspace/api-server typecheck` — pemeriksaan tipe API beserta project references.
- Perintah regresi frontend dan kedua perintah API terdaftar sebagai validasi proyek agar kegagalan menghentikan penyelesaian tugas sebelum penggabungan. Jangan menggantinya dengan `test` API biasa: suite tersebut mencakup tes database; gate tipe ini hanya mengompilasi dan memakai fixture sementara tanpa menulis data aplikasi.

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
- Setiap aplikasi memiliki ruang simpannya sendiri; Gustafta bukan penyimpanan pusat yang wajib digunakan semuanya. Data SBU disimpan dan dikelola di aplikasi SBU. Tautan ke Gustafta hanya untuk mengakses fitur-fiturnya, bukan sinkronisasi otomatis. Jika fitur Gustafta membutuhkan dokumen atau profil tersebut, pengguna memasukkan atau mengunggah ulang datanya ke Ruang Simpan Gustafta. Perubahan di satu aplikasi tidak otomatis mengubah data di aplikasi lain.
- Ruang Simpan SBU tahap awal mengelola dokumen yang terikat ke kasus, bukan penyimpanan umum tanpa kasus atau ruang berbagi tim. Versi baru mempertahankan berkas lama; hasil bedah tetap merujuk ke versi dokumen yang dipilih. Bedah Dokumen mengirim dokumen terpilih dan pertanyaan manual hanya setelah persetujuan eksplisit, tanpa mengirim profil atau berkas lain otomatis. Hasil adalah indikasi AI yang perlu ditinjau manusia, bukan autentikasi dokumen, keputusan sertifikasi, atau perubahan otomatis pada bukti/assessment. Batas bedah awal 4 MiB dan PDF maksimal 10 halaman membatasi pemrosesan serta biaya, tidak mengurangi batas penyimpanan dokumen asli.
- Berkas asli disimpan di App Storage privat; database hanya menyimpan metadata. Batas awal: PDF/PNG/JPG, 20 MiB per berkas, 20 dokumen per kasus, 200 MiB per pemilik. Penghapusan dokumen permanen memerlukan konfirmasi. Kasus yang masih mempunyai dokumen harus dikosongkan dokumennya dahulu.
- Dokumen baru maupun dokumen lama yang belum dipindai dikarantina sampai hasil ClamAV lokal bersih. Retry memakai aksi penyelesaian dokumen tanpa unggah ulang; kegagalan/timeout tidak menghapus berkas. Unduhan dan Bedah Dokumen memakai generation App Storage yang benar-benar dipindai. Hasil scan bukan keabsahan dokumen atau regulasi.
- Operasional pemindai: paket Nix `clamav` dan `util-linux` diperlukan. Freshclam mengambil signature bertanda tangan dari `database.clamav.net` saat API mulai dan setiap 12 jam; tidak ada dokumen dikirim. Cache runtime `.cache/clamav` sengaja tidak masuk Git/publikasi. Basis signature kosong/kedaluwarsa (>7 hari), kegagalan executable, batas sumber daya, atau layanan sibuk memblokir unduhan. Clamscan dibatasi satu proses per instance, 2 GiB ruang alamat, 240 detik CPU, 360 detik waktu nyata (termasuk memuat basis signature resmi), 512 MiB per berkas sementara, 100 MiB isi terurai dan kedalaman 16. Penghapusan permanen hanya atas aksi pemilik. Instance publikasi baru memerlukan akses keluar ke CDN signature dan mungkin menampilkan karantina selama pemanasan.
- Untuk pengembangan lanjutan, aturan berversi yang ditelaah menentukan hasil; AI hanya membantu ekstraksi, penjelasan, dan draf. Hasil Bedah Dokumen dan Klinik Konsultasi harus ditandai sebagai bantuan awal yang memerlukan konfirmasi/peninjauan manusia, bukan keputusan final. Contoh aturan dengan placeholder atau sumber belum terverifikasi tidak boleh menjadi aturan aktif.
- Chatbot mandiri mengikuti kebutuhan pengguna: mode BUJK, pendamping/fasilitator/konsultan, Asesor Badan Usaha, LSBU, Asosiasi Badan Usaha, dan pengguna lainnya. Mode hanya menyesuaikan konteks bantuan, bukan kewenangan atau hak akses. Katalog Gustafta adalah referensi konsep, bukan integrasi. Jangan mengirim data perusahaan, kasus atau dokumen otomatis; pengiriman teks percakapan ke penyedia AI memerlukan persetujuan pengguna. Jawaban tetap bantuan awal yang wajib ditinjau manusia dan tidak boleh mengarang persyaratan atau tanggal regulasi.
- Klinik Konsultasi SBU menyimpan percakapan privat per akun, terpisah dari Asisten peran yang tidak menyimpan percakapan. Saat membuat konsultasi, pengguna boleh memilih kasus dan secara terpisah menyetujui cuplikan lima atribut kasus yang diperlihatkan untuk disimpan sebagai snapshot. Kasus hanya boleh dibaca oleh pemilik sah; persetujuan pengiriman teks dan cuplikan ke AI diperlukan sebelum mengirim. Hasil Bedah Dokumen belum bisa dipilih sebagai konteks, tidak ada berbagi konsultasi lintas akun atau konsultan manusia, dan jawaban tidak memperbarui bukti/penilaian/keputusan secara otomatis.
- Modul Personel & SKK BUJK mencatat penugasan personel, beberapa catatan sertifikat, tanggal yang dideklarasikan, dan tautan dokumen milik akun yang sama dari Ruang Simpan SBU. Indikator tanggal (termasuk pengingat visual 30 hari) bukan verifikasi keaslian SKK, kecocokan persyaratan regulasi, atau keputusan kelayakan SBU; penghapusan catatan tidak menghapus dokumen asli. Tidak ada sinkronisasi Gustafta.
- Workroom SBU melekat pada kasus milik pengguna dan berisi checklist manual, tindak lanjut, serta jurnal kerja yang dapat diedit. Jumlah butir selesai bukan skor kesiapan SBU atau persetujuan LSBU; perubahan Workroom tidak otomatis mengubah bukti, penilaian, atau status kasus. Nama penanggung jawab tidak memberikan hak akses atau mengirim pemberitahuan. Tidak ada analisis AI, pengajuan eksternal, atau integrasi Gustafta dalam tahap ini.
- Tinjauan internal Workroom hanya mencatat keputusan pemilik kasus atas atribut kasus dan bahan yang dipilih secara eksplisit. Pratinjau menyimpan cuplikan catatan dan referensi metadata dokumen, bukan salinan berkas asli. Keputusan tidak dapat diedit/dihapus tersendiri; penghapusan kasus menghapus riwayatnya. Bahan terpilih berubah/hilang membuat snapshot lama perlu ditinjau ulang; bahan yang tidak dipilih atau ditambahkan kemudian tidak ikut disetujui. Ini bukan audit permanen, persetujuan LSBU/OSS, pemeriksaan keaslian, atau pengajuan eksternal. Konfirmasi pratinjau baru wajib diulang setelah konflik versi; jangan mengirim ulang keputusan otomatis.
- Pengguna menyetujui penambahan spesialis inti SBU sebagai pilihan topik yang terpisah dari peran: SBUClaw, SkemaClaw, LKUTClaw, ABUClaw, PanduanSBU, PJBUClaw, KeuanganClaw, LKPMClaw, OSSClaw, PUB-LKUTClaw, ESIMPANClaw, NSPKNavigatorClaw, dan SMAPClaw. Ini adaptasi konsep bantuan lokal, bukan salinan system prompt/knowledge base Gustafta, bukan multi-agent otonom, serta bukan akses atau pengiriman ke OSS/LKPM/E-SIMPAN. Daftar nama atau klaim jumlah chunks tidak membuktikan isi knowledge base tersedia.

## User preferences

- Bahasa Indonesia.
- Teks cerah dan terbaca; pengguna menyukai pasangan hitam/gelap dengan aksen terang/biru.

## Gotchas

- Setelah mengubah OpenAPI, jalankan `pnpm --filter @workspace/api-spec run codegen`.
- Jangan mengubah status “kasus selesai persiapan” menjadi klaim SBU diterbitkan.
- Pembersihan dokumen privat berjalan saat startup API dan tiap jam dalam workflow API yang sudah ada. `SBU_DOCUMENT_CLEANUP_MODE`: `delete` (bawaan), `dry-run` (hanya inspeksi/jumlah calon), atau `off`; nilai lain menghentikan startup. Masa tenggang tetap 48 jam berdasarkan metadata reservasi **dan** usia generasi objek, bukan sekadar kedaluwarsa URL PUT 15 menit. Penyelesaian unggahan tetap maksimal 30 menit.
- Semua mutasi dokumen mengambil shared transaction advisory lock sebelum row lock; pembersih mengambil exclusive try-lock dan melewati putaran jika ada mutasi aktif. Jangan menambahkan penulis metadata/salinan final yang melewati protokol ini. Dokumen ready yang dirujuk tidak pernah menjadi calon hapus. Penghapusan objek bersyarat generation; kegagalan/replay mempertahankan metadata pending untuk dicoba lagi. Pembersihan hanya namespace UUID `uploads/` dan `documents/` privat, dengan halaman maksimal 1.000 objek dan 200 reservasi per putaran.
- Log pembersihan hanya jumlah, tanpa error payload/identitas/path/nama/token/URL/isi. Uji regresi terfokus: `pnpm --filter @workspace/api-server exec node --test test/document-cleanup.test.mjs test/document-validation.test.mjs test/standalone-documents-postgres.test.mjs`. Uji memakai storage sintetis dan skema PostgreSQL terisolasi, tidak menghapus objek aplikasi nyata. Timer dalam proses membutuhkan API tetap berjalan; startup berikutnya melanjutkan pembersihan setelah downtime.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
