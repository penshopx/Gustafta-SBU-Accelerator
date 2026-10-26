# Audit ulang kesiapan operasional — 26 Oktober 2026

## Kesimpulan dan cakupan

Estimasi kesiapan berbobot: **68/100**, dengan rentang penilaian **65–75**.
Ini penilaian engineering terhadap target operasional, bukan persentase kode
selesai, cakupan tes, sertifikasi keamanan, atau jaminan kelayakan SBU.
Skor lama tidak dapat dibandingkan langsung tanpa rubrik dan batas bukti sama.

Target 100 adalah rilis yang disepakati untuk pengetahuan, studi kasus
pembelajaran, dan pendampingan persiapan SBU baru/perpanjangan. Bukan seluruh
subklasifikasi nasional, penerbitan SBU otomatis, atau integrasi eksternal.
Fitur di luar cakupan tersebut tidak harus dibangun untuk mencapai target.

## Rubrik

| Area | Bobot maksimum | Nilai sementara | Dasar dan kekurangan |
| --- | ---: | ---: | --- |
| Pusat Pengetahuan dan sumber | 15 | 9 | Daftar regulasi, status, tautan dan kutipan chatbot ada; pencarian/filter dan detail sumber berlocator pada halaman regulasi belum ditemukan. |
| Pustaka studi kasus pembelajaran | 10 | 2 | Ada rencana dan bahan kandidat; katalog pembelajaran tertelaah dengan publikasi/revisi/cabut belum ditemukan pada rute yang diperiksa. CRUD permohonan privat bukan penggantinya. |
| Ruang kerja persiapan kasus | 20 | 18 | Kasus, bukti, personel/SKK, dokumen, Workroom, tinjauan snapshot dan ringkasan ada; penyelesaian perjalanan pengguna produksi belum dibuktikan pada audit ini. |
| Simulator | 10 | 7 | Baru/perpanjangan, empat langkah, hasil dan unduh diuji; masih simulasi deklarasi, bukan validasi isi dokumen asli atau evaluator syarat resmi lengkap. |
| AI dan kontrol biaya | 15 | 11 | Pilot Claude dan penjaga biaya ada; konfigurasi tarif serta tabel anggaran produksi belum terlihat. Model pendukung belum siap diaktifkan. |
| Kontrol akses dan keselamatan data | 15 | 13 | Pemeriksaan sesi/pemilik, karantina dan batas data ada; penolakan publik teramati. Bukan audit penetrasi dan belum verifikasi seluruh alur dua akun produksi. |
| Operasional dan bukti rilis | 15 | 8 | Deployment aktif, health berhasil, build sebelumnya berhasil; pemulihan database+berkas, login produksi, alert dan uji pengguna belum dibuktikan menyeluruh. |
| **Total** | **100** | **68** | Nilai parsial mempertimbangkan implementasi sekaligus bukti; tidak berarti 32% berupa kode baru. |

## Batas bukti

**Terbukti pada audit ini:**

- Inspeksi kode halaman regulasi, rute aplikasi dan batas simulator.
- 15 tes terfokus lulus: simulator (aturan lokal dan komponen), presentasi
  regulasi, serta tinjauan internal Workroom. Tidak ada tes dilewati.
- Runner mengeluarkan peringatan port WebSocket 24678 sudah digunakan;
  seluruh tes tetap lulus. Jangan menganggapnya hasil uji browser produksi.
- Preview simulator tampil dengan jelas sebagai simulasi deklarasi.
- Metadata deployment melaporkan deployment autoscale publik dan build sukses
  pada `https://gustafta-sbu-accelerator.replit.app`.
- Produksi: health 200; daftar kasus dan status anggaran tanpa login 401;
  integrasi Ruang Simpan yang dibatalkan 410 dengan `private, no-store`.
- `/simulator` produksi mengembalikan HTML 200. Ini bukan bukti interaksi
  simulator produksi atau bukti kesamaan versinya dengan development.
- Konfigurasi produksi tidak menampilkan profil tarif Claude/GPT. Konfigurasi
  batas opsional juga tidak ditemukan; ketidakhadirannya bukan kesalahan,
  karena ada batas bawaan.
- Metadata `information_schema.tables` produksi tidak menampilkan tiga tabel
  anggaran di skema public. Tidak membaca data pelanggan.

**Bukti sebelumnya, bukan tes ulang audit ini:** 31 tes backend anggaran/chat,
typecheck backend, inisialisasi pengunci transaksional, build API/frontend dan
satu smoke Claude sintetis di development. Tidak dijumlahkan sebagai suite
baru atau dianggap telah lolos di produksi.

**Belum Terverifikasi:** perjalanan login dan alur privat produksi lengkap,
kesamaan build development/live, pemulihan cadangan database dan berkas,
pengiriman alert produksi, penerimaan pengguna nyata, seluruh cakupan aturan
yang akan ditawarkan. Tidak ditemukannya bukti pemulihan bukan bukti bahwa
cadangan tidak tersedia.

**Belum Tersedia pada area kode yang diperiksa:** pencarian/filter regulasi,
detail sumber berlocator pada halaman tersebut, dan katalog studi kasus
pembelajaran tertelaah. Kutipan berlocator di chatbot tidak sama dengan
detail sumber di Pusat Pengetahuan.

## Prioritas menuju 100

### P0 — Buktikan rilis aman dan operasional

1. Terapkan diff skema melalui Publish yang disetujui pengguna, bukan DDL
   startup/build atau migrasi manual produksi. Verifikasi tabel setelahnya.
2. Verifikasi profil tarif Claude lalu konfigurasi produksi dengan persetujuan;
   jangan menaikkan pagu atau mengaktifkan GPT sebagai jalan pintas.
3. Pastikan versi yang dipublikasikan memuat inisialisasi pengunci transaksional.
   GET status tidak menulis; reservasi final tetap wajib commit sebelum AI.
4. Dengan akun uji yang disetujui dan pembersihan terencana, buktikan login,
   buat/edit kasus, bukti, unggah, ringkasan dan isolasi dua akun. Jangan
   memakai pelanggan nyata atau memanggil AI berbayar tanpa izin.
5. Latih pemulihan database dan berkas di lingkungan terisolasi; verifikasi
   notifikasi antivirus serta prosedur signature belum siap.

Selesai bila bukti rilis, pemulihan dan penanggung jawab operasi tercatat.
Health 200 saja tidak meluluskan P0.

### P1 — Pengetahuan dan studi kasus yang benar-benar dapat dipakai

1. Pencarian dan filter sumber menurut topik, jenis sumber dan status telaah;
   detail versi, locator PDF/cetak, URL dan batas verifikasi.
2. Batch awal studi kasus terpilih dengan fakta/asumsi, sumber, pembahasan,
   batas kesimpulan, versi dan keputusan telaah manusia.
3. Pisahkan kasus simulasi dari kasus nyata berizin yang dianonimkan.
   Latihan tidak menjadi fakta permohonan pengguna.

Selesai bila pengguna dapat menemukan panduan dan membuka sumber yang tepat;
sumber dicabut tidak dipakai untuk jawaban baru. Tidak mengaktifkan draf BG001.

### P2 — Pendampingan dan simulator sesuai cakupan resmi

1. Satukan temuan, tindakan, PIC, target, bukti perbaikan dan tinjauan ulang
   pada kasus yang sama, tanpa menggandakan tindak lanjut.
2. Tentukan kombinasi usaha/subklasifikasi/kualifikasi yang benar-benar
   ditawarkan. Hanya aturan yang telah ditelaah boleh menjadi pemeriksaan aktif.
3. Pisahkan kelengkapan deklarasi, validasi format, konsistensi antarberkas,
   dan verifikasi keaslian. Yang belum didukung harus disebut belum dinilai.
4. Uji ekspor dan alur baru/perpanjangan pada cakupan terpilih; jangan membuat
   penolakan perpanjangan otomatis dari ketidakpastian pengalaman BG001.

### P3 — Pilot pengguna dan optimasi

1. Uji pengguna representatif dengan kriteria tugas dan pencatatan kegagalan.
2. Ukur waktu respons, beban serentak, aksesibilitas dan pengalaman mobile.
3. Tinjau kapasitas AI: reservasi penuh Claude dan pagu Asisten saat ini hanya
   memungkinkan sekitar satu percobaan gabungan per hari. Ini batas kapasitas
   pilot, bukan tagihan aktual atau permintaan menaikkan anggaran.
4. Optimasi bundle frontend setelah alur dan bukti penerimaan benar.

## Gerbang keputusan

- **Pilot internal:** layak dilanjutkan secara terkontrol di development.
- **Pilot produksi AI:** belum direkomendasikan sampai P0 terkait terpenuhi.
- **Penjualan umum sebagai platform pengetahuan/studi kasus/pendampingan:**
  belum direkomendasikan sebelum P1, cakupan P2 dan penerimaan P3 terbukti.
- Jangan menambahkan MCP live, kolaborasi lintas akun, pembayaran, atau
  pengajuan OSS/LSBU hanya untuk menaikkan angka. Semuanya perlu lingkup dan
  otorisasi terpisah.

Tidak ada kode runtime, konfigurasi, database produksi, integrasi, atau
publikasi yang diubah dalam audit ini. Hanya laporan audit ditambahkan.
