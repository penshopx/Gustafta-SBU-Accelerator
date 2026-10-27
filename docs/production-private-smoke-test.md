# Prosedur uji privat produksi: kasus, SMAP, dan ekspor

## Status dan batas

Dokumen ini adalah prosedur, bukan hasil pengujian atau alat eksekusi.
Pemeriksaan awal hanya berhasil membuka halaman publik produksi. Login
sintetis, simpan SMAP, dan ekspor privat produksi **belum diverifikasi**.

Pengguna mengizinkan pengujian dengan akun sintetis. Izin tersebut tidak
mencakup publikasi, perubahan konfigurasi autentikasi, migrasi, akses akun
pelanggan, atau panggilan AI berbayar.

## Gerbang wajib sebelum membuat akun

Semua butir berikut harus terpenuhi; satu butir yang belum terbukti berarti
**BERHENTI sebelum membuat akun maupun data**.

- Dapatkan URL produksi dari metadata deployment, bukan URL preview.
- Catat identitas build jika tersedia. Bila tidak, tulis “build belum
  diidentifikasi”; jangan menganggap sumber lokal sama dengan build aktif.
- Pastikan fasilitas sign-in sintetis secara eksplisit menargetkan tenant
  Clerk produksi. Fasilitas development tidak membuktikan akses produksi.
- Tetapkan operator dan mekanisme berwenang untuk membersihkan **akun Clerk
  produksi dan seluruh data aplikasi milik akun uji**. Keduanya diperlukan.
- Uji bahwa mekanisme pembersihan dapat dimuat dengan daftar fixture kosong.
  Ini hanya pemeriksaan pemuatan, bukan bukti izin penghapusan.
- Mekanisme harus menolak email/ID di luar manifest uji, menolak pemilik
  ambigu, dan memeriksa hubungan data sebelum menghapus. Jangan memakai
  pencocokan prefix umum atau mengosongkan tabel.
- Simpan manifest privat sebelum sign-in: penanda run unik, lingkungan
  produksi, email sintetis persis, waktu mulai, dan status pembersihan.
  Tambahkan ID akun/kasus segera setelah diketahui. Jangan simpan password,
  cookie, token, atau isi dokumen di manifest maupun laporan.
- Tetapkan pemulihan bila browser/runner berhenti: manifest tetap tersedia
  bagi operator sampai pembersihan berhasil diverifikasi.

Helper lokal
`artifacts/api-server/test/helpers/cleanup-form-owner-browser-fixtures.mjs`
mengimpor klien Clerk dan pool database lingkungan lokal. **Jangan
menjalankannya dengan asumsi bahwa ia menargetkan produksi.** Jangan menyalin
credential produksi ke browser/notebook atau mengganti credential lokal.
Alat SQL produksi read-only bukan sarana untuk melakukan pembersihan.

Belum ada jembatan autentikasi dan pembersihan produksi yang terverifikasi
untuk prosedur ini. Jangan menambah bypass login, endpoint cleanup publik,
atau menonaktifkan pemeriksaan pemilik untuk mengatasi batas tersebut.

## Skenario minimal setelah gerbang terpenuhi

Gunakan satu akun baru dengan email sintetis unik dan nama badan usaha
`UJI SINTETIS SBU — <run>`. Jangan memakai identitas badan usaha nyata.
Tidak perlu mengunggah berkas untuk skenario ini.

1. Masuk melalui fasilitas pengujian produksi yang telah diverifikasi.
   Pastikan identitas sesi dan profil aplikasi sesuai akun manifest.
2. Lengkapi onboarding menggunakan peran yang secara sah dapat membuat kasus.
   Buat satu kasus persiapan baru dengan penanda run, bukan pengajuan eksternal.
3. Buka **Checklist internal SMAP**. Pastikan label persiapan internal
   terlihat dan bukan klaim sertifikasi ISO, keputusan KPK, atau LSBU.
4. Pilih satu butir, isi deklarasi “Tidak ada” dan catatan
   `Catatan sintetis <run>`, tanpa referensi dokumen. Simpan.
   Muat ulang halaman dan pastikan deklarasi/catatan/revisi tetap terbaca.
5. Bila fitur telaah tersedia, catat “Perlu perbaikan” dengan catatan
   sintetis. Jangan menyatakan “Memadai” tanpa bukti. Muat ulang dan pastikan
   keputusan tetap terikat revisi yang diuji.
6. Unduh ringkasan HTML. Pastikan berkas memuat kasus uji yang benar,
   23 butir SMAP, catatan/deklarasi terakhir, keputusan telaah jika dibuat,
   locator sumber contoh, dan peringatan batas verifikasi.
   Jangan menerima HTML halaman login sebagai keberhasilan unduh.
7. Buka tindakan cetak. Pastikan ringkasan kasus yang sama dimuat dan dialog
   cetak dapat dipanggil. Bila PDF benar-benar disimpan, periksa konten dan
   peringatannya; screenshot atau dialog cetak saja bukan bukti PDF benar.
8. Pastikan tidak ada aksi AI, unggahan asli, penilaian otomatis, integrasi
   Gustafta, atau pengiriman sertifikasi eksternal yang dipicu pengujian.

Jika kontrol yang diperlukan tidak ada pada build produksi, catat sebagai
“tidak tersedia pada build yang diamati”; jangan langsung menyimpulkan
implementasi lokal hilang atau memublikasikan perubahan.

## Pembersihan dan kegagalan

- Jalankan mekanisme berwenang yang disepakati, hanya untuk akun dan kasus
  dalam manifest. Periksa ketergantungan aktual sebelum penghapusan:
  profil, kasus, revisi SMAP/telaah, dan data turunan yang sempat tercipta.
  Jangan mengandalkan cascade lokal sebagai bukti skema produksi.
- Bersihkan data aplikasi dan akun Clerk sesuai urutan yang tervalidasi;
  pastikan akun tidak dapat terus menulis ketika pembersihan berlangsung.
- Verifikasi akun sintetis sudah tidak ada di tenant yang benar dan tidak
  ada data aplikasi tersisa untuk ID pemilik/kasus persis. Respons UI kosong
  saja bukan bukti data telah dihapus.
- Hapus unduhan/PDF sintetis dan manifest hanya setelah pemeriksaan sisa
  berhasil. Jangan memasukkan ID akun, email, atau catatan privat ke Git.
- Jika pembersihan gagal, hentikan run berikutnya dan pertahankan manifest
  privat untuk pemulihan. Laporkan kegagalan uji utama dan kegagalan cleanup
  secara terpisah; jangan menutupi salah satunya.

## Format hasil

Catat per langkah: **lulus / gagal / terhalang / belum diuji**, waktu,
lingkungan, build jika diketahui, dan bukti yang disanitasi.

Ringkasan wajib membedakan:

1. Halaman publik berhasil dimuat.
2. Login dan penyimpanan privat produksi terbukti atau belum.
3. Unduhan HTML, pemanggilan cetak, dan pemeriksaan PDF sebagai bukti terpisah.
4. Pembersihan akun dan data aplikasi terbukti atau masih tertunda.
5. Tidak ada panggilan AI berbayar maupun publikasi.

Keberhasilan run terbatas ini tidak membuktikan seluruh alur dua akun,
ketahanan konkurensi, keaslian dokumen, penerapan hukum, atau kesiapan
aplikasi 100%.

Lihat juga [checklist SMAP](smap-checklist-internal.md) dan
[gerbang database/publikasi](publication-database-readiness.md).
