# Audit ulang kesiapan operasional — 29 Oktober 2026 (WIB)

> **Pembaruan setelah perbaikan yang diizinkan pengguna:** P0-A dan P0-B di bawah
> sudah diselesaikan. Typecheck seluruh workspace lulus; enam uji regulasi
> lulus; build frontend, API, film dan sandbox lulus menggunakan konteks build
> masing-masing artefak. Tidak ada publikasi. Isi audit dan nilai awal di bawah
> merekam kondisi sebelum perbaikan, bukan penilaian ulang produksi.

## Kesimpulan

**Estimasi engineering: 72/100, dengan rentang ketidakpastian 70–80.**
Ini estimasi kesiapan rilis terhadap lingkup yang ditawarkan, bukan persentase
kode, cakupan tes, sertifikasi keamanan atau probabilitas kelulusan SBU.
Nilai tidak dihitung dari jumlah tugas MERGED.

Produk sudah mempunyai fondasi ruang kerja persiapan dan panduan yang luas.
Namun, **gerbang pemeriksaan workspace belum lulus** dan ada regresi halaman
regulasi yang gagal. Rekomendasinya adalah memperbaiki pemeriksaan tersebut
sebelum mengesahkan rilis berikutnya, kemudian menjalankan pilot terkontrol.
Belum cukup bukti untuk klaim validator seluruh persyaratan SBU atau layanan
operasional luas tanpa pendamping.

Audit ini tidak mengubah kode aplikasi, izin, konfigurasi, data pelanggan atau
publikasi. Tidak membuat akun, mengunggah berkas atau memanggil AI berbayar.

## Rubrik berbobot

Rubrik mengikuti tujuh area audit 26 Oktober, dengan penilaian ulang berdasarkan
implementasi dan bukti yang tersedia. Kemajuan fitur tidak otomatis menaikkan
nilai jika bukti rilis dan penerimaan pengguna belum lengkap.

| Area | Maksimum | Estimasi | Dasar dan sisa pekerjaan |
|---|---:|---:|---|
| Pengetahuan dan sumber | 15 | 13 | Ada pencarian/filter dan detail sumber berlocator; Help Desk dan manual membantu penggunaan. Tiga regresi halaman regulasi masih gagal. Telaah sumber tetap terpisah dari keberlakuan hukum. |
| Pustaka studi kasus pembelajaran | 10 | 2 | Mode Pakar Studi Kasus ada. Katalog pembelajaran tertelaah dengan publikasi/revisi/cabut belum ditemukan pada rute, skema dan kontrak yang diperiksa. Permohonan privat bukan katalog tersebut. |
| Ruang kerja persiapan | 20 | 18 | Kasus, bukti, personel/SKK, dokumen, analisis, tindak lanjut, tinjauan snapshot, SMAP, agenda dan ekspor ada. Perjalanan lengkap produksi dan penerimaan pengguna belum diuji ulang. |
| Simulator dan alat bantu | 10 | 8 | Simulator baru/perpanjangan dan Mini Apps ada. Tetap alat deklarasi/persiapan, bukan pemeriksaan keaslian atau evaluator lengkap seluruh skema. |
| AI dan kontrol biaya | 15 | 12 | Harness Claude, enam tujuan, cakupan skema dan pencabutan sumber mempunyai uji terfokus yang lulus. Konfigurasi dan konsumsi biaya produksi tidak diverifikasi ulang. |
| Akses dan keselamatan data | 15 | 13 | Batas sesi/pemilik dan mekanisme berkas privat ada; endpoint privat tanpa login menolak. Bukan pentest atau uji dua akun produksi. |
| Operasional dan bukti rilis | 15 | 6 | Situs/health publik aktif, manual dan bantuan tersedia. Typecheck workspace gagal; kesamaan build, restore DB+berkas, notifikasi produksi dan UAT belum dibuktikan dalam audit ini. |
| **Total** | **100** | **72** | Skor konservatif; sisa kesiapan tidak seluruhnya berupa penambahan kode. |

Target 100 adalah rilis persiapan SBU yang cakupannya jelas dan terbukti bekerja.
Bukan penerbitan sertifikat, semua subklasifikasi nasional atau integrasi otomatis
OSS, E-SIMPAN, SIMPK, PANCEK dan sistem asosiasi.

## Temuan prioritas

### P0-A — Pemeriksaan tipe seluruh workspace gagal

Perintah baru audit:

```sh
pnpm run typecheck
```

Hasil: **exit 2**, pada `artifacts/mockup-sandbox/vite.config.ts:36`.
TypeScript melaporkan TS2769: tipe `Plugin<any>` tidak kompatibel dengan
`PluginOption`, dengan rantai perbedaan tipe Vite/Rollup (`hotUpdate`).

Ini temuan pada sandbox desain, bukan bukti aplikasi utama gagal dibuka.
Namun perintah root `build` diawali pemeriksaan tipe root tersebut, sehingga
jalur build root belum dapat dinyatakan lulus. Audit tidak menjalankan ulang
seluruh build setelah kegagalan ini. Build/typecheck frontend utama berhasil
pada pemeriksaan fitur Help Desk sebelumnya; keduanya bukan kelulusan workspace.

**Kriteria selesai:** selaraskan kompatibilitas plugin/tipe tanpa menutupinya
dengan cast sembarang atau menghapus pemeriksaan; buktikan typecheck dan jalur
build yang benar-benar dipakai untuk rilis berhasil.

### P0-B — Tiga dari lima regresi halaman regulasi gagal

Perintah baru audit:

```sh
pnpm --filter @workspace/gustafta-sbu exec node --import tsx --test src/components/regulations-page.test.tsx
```

Hasil: **2 lulus, 3 gagal**:

- Halaman menahan tenggat respons API tanpa menyatukan tiga alur transisi:
  HTML masih memenuhi pola keadaan memuat/kosong/gagal yang seharusnya tidak
  muncul dalam fixture sukses.
- Keputusan API per alur: jumlah indikator yang diharapkan tidak ditemukan.
- Persetujuan semua alur/pencabutan: jumlah indikator yang diharapkan tidak
  ditemukan.

Belum disimpulkan apakah penyebabnya fixture/ekspektasi yang tertinggal,
perubahan markup, atau logika aplikasi. Kegagalan ini **bukan bukti** tanggal
produksi salah atau terjadi kebocoran data.

**Kriteria selesai:** tentukan penyebab, cocokkan fixture dengan kontrak nyata,
dan pertahankan pengujian negatif tanggal/cache/keputusan per alur. Jangan
melonggarkan gating regulasi hanya untuk membuat tes hijau.

### P0-C — Lengkapi bukti rilis dan operasi privat

- Cocokkan sumber/build dengan revisi yang benar-benar dipublikasikan.
- Dengan akun sintetis yang diizinkan dan cleanup terencana, buktikan login,
  profil, kasus baru/perpanjangan, dokumen, bukti, personel, analisis dengan
  persetujuan, tinjauan, agenda dan ekspor.
- Buktikan isolasi dua akun serta pemulihan gagal simpan/koneksi pada perjalanan
  yang benar-benar ditawarkan. Jangan menganggap HTTP 401 cukup.
- Latih pemulihan database dan objek pada lingkungan terisolasi; buktikan
  pengiriman peringatan dan pemulihan operasional produksi sesuai kewenangan.
- Uji pengguna nyata secara terbatas setelah lingkungan dan perlindungan data
  siap. Tidak perlu langsung memakai dokumen sensitif asli pada tahap awal.

Backup/alert/UAT yang belum dibuktikan dalam audit ini berstatus
**Belum Terverifikasi**, bukan **Belum Tersedia**.

### P1 — Lengkapi produk pengetahuan, bukan sekadar menambah chatbot

- Bangun pustaka studi kasus pembelajaran yang tertelaah, dianonimkan atau jelas
  berlabel sintetis: masalah, bahan, dasar sumber, analisis, batas kesimpulan,
  tindak lanjut, hasil telaah dan versi/cabut.
- Bedakan pustaka pembelajaran, kasus privat pengguna dan mode chat studi kasus.
- Tetapkan matriks cakupan aturan untuk skema/jenis permohonan yang ditawarkan.
  Pilot Pakar Skema BG001–BG009 dan BS001–BS020 membantu pemetaan KBLI/ruang
  lingkup, bukan bukti kelengkapan seluruh persyaratan kualifikasi.
- Panduan/link kewajiban OSS, pengalaman, peralatan, PUB/LKUT, integritas dan
  asosiasi tidak otomatis berarti pengecekan langsung pada sistem eksternal.
  Audit ini tidak memverifikasi pemenuhan kewajiban tersebut pada badan usaha.

### P2 — Pendalaman kegunaan dan pengelolaan

- Uji keberhasilan tugas dengan admin BUJK, peninjau dan asesor; catat lokasi
  kebingungan, koreksi jawaban dan langkah yang belum dapat diselesaikan.
- Manual Super Admin/Admin/User membagi tanggung jawab, bukan membuat RBAC.
  Hierarki admin umum, kolaborasi lintas akun dan dashboard Super Admin tidak
  ditemukan sebagai fasilitas umum pada jalur yang diperiksa. Bangun hanya
  jika masuk lingkup layanan; jangan membuka data lintas pemilik sebagai jalan
  pintas dukungan.
- Help Desk adalah panduan lokal, bukan LLM, pemantau akun atau petugas manusia.
  Pertahankan pemisahan dari konsultasi substantif berbiaya.
- Evaluasi pemuatan awal. Build frontend sebelumnya memperingatkan chunk besar;
  ini risiko yang perlu diukur, bukan bukti aplikasi pasti lambat.

### P3 — Perluasan sesudah pilot berhasil

Perluasan skema, model pendukung, orkestrasi multi-agen atau integrasi eksternal
menunggu manfaat nyata, bukti sumber, anggaran dan persetujuan akses yang jelas.
Tidak menjadi syarat otomatis untuk menyelesaikan rilis persiapan yang terbatas.

## Bukti baru audit

### Pengujian terfokus — bukan seluruh suite

```sh
pnpm --filter @workspace/api-server exec node --test test/sbu-chat-harness.test.mjs test/sbu-chat-source-reviews.test.mjs
```

**9 lulus, 0 gagal**, memakai fixture/adaptor terkontrol. Mencakup instruksi
Claude dan enam tujuan, batas masukan/hasil terpotong, pergantian/pencabutan
versi, penolakan citation lama, pembatasan aktor, serta perubahan sumber selama
generasi. Tidak membuktikan kualitas jawaban LLM langsung atau telaah hukum.

Digabung dengan lima uji halaman regulasi: **14 uji terfokus, 11 lulus dan
3 gagal**. Hasil sebelumnya, termasuk pengujian Help Desk, tidak dihitung ulang
sebagai uji baru.

### Produksi — pemeriksaan publik tanpa login

URL diperoleh dari metadata deployment saat audit:
`https://gustafta-sbu-accelerator.replit.app` — deployment aktif, publik, autoscale.

| Pemeriksaan | Hasil | Batas kesimpulan |
|---|---|---|
| `GET /` | 200, HTML | Landing terlayani; bukan bukti semua interaksi. |
| `GET /api/healthz` | 200 | Health merespons; bukan bukti scanner/storage/AI sehat menyeluruh. |
| `GET /api/cases` tanpa sesi | 401 | Satu pembacaan privat menolak tanpa login. |
| `GET /api/dashboard` tanpa sesi | 401 | Satu pembacaan privat menolak tanpa login. |
| Bundle utama publik | 200, penanda `help-desk-trigger` ada | Kode Help Desk sudah terdeteksi di bundle publik; dialog produksi belum diuji interaktif. |
| Nama/hash asset JS publik vs lokal | Berbeda | Kesamaan build belum terbukti; bukan otomatis berarti produksi usang/rusak. |

Observasi mesin: `generated-artifacts/audit/public-check-2026-10-29.json`.

### Preview dan inspeksi kode

- Landing root dirender dengan navigasi, CTA, peringatan independensi dan tombol
  Bantuan. Snapshot tidak menunjukkan halaman kosong atau error JavaScript;
  peringatan Clerk development key muncul di lingkungan development.
- `knowledge-sources-section.tsx`: pencarian/filter, keadaan tanpa hasil,
  pemilihan sumber, dialog detail dan locator PDF/cetak.
- `App.tsx`: jalur ruang kerja dan batas profil/pemilik.
- `sbu-chat-schemes.ts`: batas pilot dan larangan mengarang persyaratan.
- Tidak ditemukan jalur katalog studi kasus pembelajaran pada pencarian rute,
  kontrak API dan skema yang diperiksa.

## Batas audit

Bukan pemeriksaan penetrasi, pemindaian keamanan penuh, pemeriksaan isi database
produksi, uji beban, pengukuran uptime, evaluasi seluruh aturan atau UAT
pelanggan. Tidak membaca dokumen privat atau nilai secret.

**Keputusan rilis:** perbaiki P0-A/P0-B, buktikan P0-C untuk lingkup yang
disepakati, lalu nilai pilot terbatas. Peluncuran berbayar terbatas memerlukan
bukti operasi/dukungan yang cukup; penjualan umum belum dapat disahkan hanya
dari inspeksi kode dan endpoint publik.

## Bukti penutupan dua pemeriksaan

- P0-A: plugin Replit yang memakai tipe Vite diberi deklarasi peer dependency
  yang hilang melalui `packageExtensions`; lockfile diperbarui. Versi plugin
  tidak dinaikkan, pemeriksaan tipe tidak dilemahkan, dan tipe tidak dipaksa
  melalui cast.
- P0-B: fixture query memakai key yang menyertakan pemilik, sesuai hook asli.
  Seluruh asersi pemisahan alur, tanggal, pencabutan dan penanganan error tetap
  dipertahankan. Ada regresi tambahan untuk cache lama tanpa pemilik dan cache
  akun lain. Hasil: enam lulus, nol gagal.
- Typecheck root selesai untuk seluruh library dan lima leaf workspace.
- `pnpm run build` tanpa konteks service berhenti pada pemeriksaan wajib
  `PORT`/`BASE_PATH`. Build kemudian diverifikasi per artefak dengan nilai
  sementara sesuai preview path: frontend `/`, film `/gustafta-film/`, dan
  sandbox `/__mockup`; API build juga lulus. Tidak mengubah variabel lingkungan
  tersimpan atau mengendurkan pemeriksaan startup.
- Peringatan ukuran chunk frontend tetap ada. Peringatan peer React/Clerk
  diselesaikan pada tindak lanjut di bawah. Kelulusan pemeriksaan
  bukan pengesahan produksi atau hasil pemindaian keamanan.

## Tindak lanjut kompatibilitas React/Clerk

- React dan React DOM diselaraskan dari 19.1.0 ke 19.1.4, tetap pada minor yang
  sama dan memenuhi peer Clerk yang terpasang. Renderer pengujian juga memakai
  19.1.4; ada pengujian baru yang menolak ketidaksamaan ketiga versi.
- Tidak ada aplikasi Expo aktif dalam workspace yang diperiksa. Catatan pin
  Expo pada katalog lama diganti dengan alasan penyelarasan artefak web.
- Instalasi tidak lagi melaporkan unmet peer React/React DOM pada Clerk. Versi
  SDK Clerk, konfigurasi provider, sesi, izin, secret dan data tidak diubah.
- Typecheck seluruh workspace lulus. Pengujian frontend terfokus 40/40 lulus
  (isolasi akun, pembacaan privat, profil, Help Desk, regulasi dan versi runtime).
  Pengujian sesi Clerk dengan fixture terkontrol 58/58 lulus.
- Build frontend utama, film dan sandbox dengan konteks artefaknya lulus.
  Peringatan chunk besar dan beberapa dependensi deprecated masih terpisah;
  tidak dinonaktifkan atau disembunyikan.
- Tidak ada publikasi, pengujian login nyata produksi atau penilaian ulang
  persentase kesiapan berdasarkan perubahan dependensi ini.
