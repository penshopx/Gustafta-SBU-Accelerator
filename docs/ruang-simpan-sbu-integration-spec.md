# Spesifikasi Integrasi Gustafta Ruang Simpan ↔ SBU Accelerator

**Status:** draf rancangan untuk ditinjau, bukan kontrak hulu yang sudah disepakati.
**Tanggal:** 5 Oktober 2026.
**Acuan:** framework SBU Accelerator yang dilampirkan pengguna; kontrak profil dan panduan pemasangan dalam proyek.

Dokumen ini tidak mengaktifkan koneksi, mengubah izin, atau membuktikan bahwa endpoint hulu sudah beroperasi. Detail halaman Notion yang hanya ditautkan dalam lampiran belum tersedia dalam ekspor.

## 1. Tujuan dan batas

Pengguna menyiapkan kasus SBU menggunakan data perusahaan dari Ruang Simpan, tanpa membuat penyimpanan profil dan dokumen asli kedua di SBU.

- Ruang Simpan mengelola data sumber dan otorisasi aksesnya.
- SBU mengelola kasus, deklarasi bukti, pemeriksaan, temuan, dan tindak lanjut.
- AI membantu ekstraksi, penjelasan, dan draf; mesin aturan menentukan hasil pemeriksaan.
- Pengguna meninjau data dan dokumen keluaran. Pengajuan OSS/SIJK tetap manual.
- Hasil merupakan persiapan awal, bukan verifikasi keaslian, keputusan LSBU, atau jaminan penerbitan SBU.

## 2. Kemampuan saat ini versus pengembangan

| Kemampuan | Status yang dapat dinyatakan |
|---|---|
| Backend dan halaman SBU untuk membaca profil | Sudah ada dalam kode |
| Koneksi terpisah berdasarkan akun SBU yang diautentikasi | Sudah didukung melalui pemetaan server yang harus diverifikasi |
| Profil berisi nama, NIB, alamat, revisi, waktu pembaruan | Kontrak profil yang tersedia |
| Token `profile:read`, berlaku 90 hari, dapat dicabut | Ketentuan kontrak yang tersedia; keberhasilan live tetap perlu diuji |
| Koneksi live berhasil dan profil pemilik yang tepat terbaca | Tidak boleh diklaim sebelum pembuktian |
| Pilihan folder, daftar dokumen, unduh konten, akses dokumen melalui agen | Usulan pengembangan; belum didukung oleh kontrak profil |
| OCR, data hasil ekstraksi tersimpan, sinkronisasi berbasis webhook | Usulan pengembangan |
| Konsultan multi-klien dan akses bersama dalam satu perusahaan | Usulan pengembangan; bukan izin yang otomatis diperoleh dari pilihan peran profil |

## 3. Pembagian tanggung jawab

### Ruang Simpan

- Menyimpan dan memperbarui profil serta dokumen asli.
- Mengelola koneksi terpisah untuk setiap aplikasi penerima.
- Memeriksa pemilik, perusahaan, izin, dan masa berlaku koneksi pada setiap permintaan.
- Untuk pengembangan dokumen: memeriksa keanggotaan folder dan izin pada daftar, pencarian, metadata, pratinjau, serta konten.
- Menolak akses lewat ID atau tautan yang diketahui jika dokumen berada di luar izin.

### SBU Accelerator

- Mengautentikasi sesi lokal dan menentukan pemilik kasus dari server.
- Menemukan koneksi milik akun itu; tidak menerima pemilik dari parameter browser.
- Membaca sumber melalui backend, memvalidasi respons, dan menampilkan kegagalan secara jelas.
- Tidak menulis kembali ke Ruang Simpan dalam integrasi awal.
- Mengelola referensi sumber, penggunaan bukti dalam kasus, aturan yang dipakai, temuan, dan audit.

### Navigator dan agen

- Mendapat tugas untuk kasus tertentu dengan izin yang dibatasi.
- Menggunakan alat backend yang memeriksa izin, bukan memegang token Ruang Simpan.
- Tidak menerima seluruh dokumen perusahaan atau token di prompt.
- Tidak mengubah aturan aktif, memberikan akses tim, atau mengirim dokumen keluar tanpa otorisasi.

## 4. Kepemilikan dan penghubungan akun

Kepemilikan token Ruang Simpan dan identitas akun SBU adalah dua hal berbeda. Kesamaan email tidak menjadi bukti penghubung.

### Tahap awal: pemasangan terkelola

1. Pemilik membuat koneksi aplikasi di Ruang Simpan dengan izin `profile:read`.
2. Operator memastikan akun SBU yang ditunjuk memang berhak menggunakan profil dari koneksi tersebut; bukti hubungan harus dicatat, bukan disimpulkan dari email.
3. Token disimpan sebagai secret backend.
4. ID akun SBU yang sah dipetakan ke nama secret, bukan ke nilai token.
5. Pembacaan profil dilakukan dan identitas perusahaan diperiksa oleh pemilik.
6. Koneksi disebut berhasil hanya setelah langkah pembuktian tersebut selesai.

Setiap pemilik menggunakan koneksi tersendiri. Tidak ada token bersama sebagai cadangan. ID akun lingkungan pengembangan dan produksi harus dipetakan secara terpisah.

### Pengembangan: penghubungan mandiri

Ruang Simpan perlu menyediakan alur otorisasi yang membuktikan hubungan pemilik dan aplikasi penerima:

- Pengguna masuk ke kedua aplikasi dan memilih perusahaan sumber.
- Ruang Simpan menampilkan aplikasi penerima, izin, dan pilihan folder.
- Persetujuan menghasilkan kode sekali pakai yang berumur pendek; tidak mengirim token akses dalam URL.
- Kode ditukar server-ke-server dan terikat pada aplikasi, alamat callback yang diizinkan, serta sesi pemohon. Terapkan perlindungan CSRF/state dan PKCE sesuai jenis klien.
- Hasil penghubungan menyediakan identitas pemilik/perusahaan sumber yang stabil dan izin efektif.
- SBU menyimpan hubungan itu hanya terhadap akun atau keanggotaan perusahaan lokal yang sah.

Alur ini merupakan kebutuhan baru, bukan klaim bahwa OAuth atau endpoint penukaran kode sudah tersedia.

## 5. Izin

| Kebutuhan | Izin/status |
|---|---|
| Membaca profil | `profile:read`, tersedia dalam kontrak |
| Mengubah profil | Tidak diminta |
| Membaca metadata dan isi dokumen | Nama scope dan kontraknya harus disepakati dengan Ruang Simpan |
| Memilih folder | Harus menjadi pembatas sumber, bukan sekadar filter tampilan SBU |
| Mengunggah, mengubah, atau menghapus dokumen sumber | Tidak termasuk integrasi awal |
| Mengirim data ke OCR/AI eksternal | Persetujuan pemrosesan terpisah; tidak otomatis diperoleh dari izin baca |

**Usulan kebijakan folder:** folder yang dipilih mencakup dokumen langsung di dalamnya saja. Subfolder harus disetujui secara eksplisit. Dokumen yang baru ditambahkan ke folder akan ikut tercakup selama koneksi aktif; konsekuensi ini harus dijelaskan saat persetujuan.

Pemindahan dokumen keluar dari folder yang diizinkan menghentikan akses berikutnya. Perubahan hierarki, folder terhapus, dan dokumen dengan beberapa lokasi harus memiliki aturan yang disepakati sebelum implementasi.

## 6. Kontrak profil yang dipertahankan

### Hulu Ruang Simpan

- Host acuan: `https://gustafta.my.id`.
- `GET /api/v1/ruang-simpan/company-profile`.
- HTTPS server-ke-server dengan Bearer token.
- Tanpa body dan tanpa parameter `user_id`.
- Respons sukses berupa objek langsung dengan `name`, `nib`, `address`, `revision`, dan `updated_at`.
- Profil yang belum diisi tetap merupakan respons sukses yang sah.
- `Cache-Control: private, no-store`.
- Ketentuan batas permintaan yang tersedia: 60 per menit per koneksi; pemeriksaan awal token juga 60 per menit per IP.

### Lokal SBU

- `GET /api/ruang-simpan/company-profile`.
- Menggunakan sesi SBU; browser tidak mengirim token sumber.
- Respons sukses lokal berbentuk `{ userId, profile }`.
- `userId` berasal dari sesi, bukan permintaan klien.
- Profil dibaca untuk tampilan, tidak disalin ke database SBU.

Detail normatif tetap mengikuti `ruang-simpan-profile-contract.md`; dokumen ini tidak mengganti kontrak tersebut.

## 7. Kontrak dokumen yang perlu disepakati

Kemampuan berikut belum menjadi endpoint hulu yang tersedia. Nama route dan scope harus disepakati sebelum membuat klien.

| Operasi | Kebutuhan minimum |
|---|---|
| Memeriksa koneksi | ID koneksi, pemilik/perusahaan sumber, izin efektif, masa berlaku, revisi otorisasi |
| Menampilkan folder yang diizinkan | ID stabil, nama, cakupan subfolder, izin efektif |
| Daftar/pencarian dokumen | Hanya dokumen dalam izin, pagination dan batas hasil |
| Metadata dokumen | ID, revisi, jenis berkas, ukuran, lokasi, waktu perubahan, penanda konten yang stabil |
| Membaca konten | Izin diperiksa ulang saat akses; tidak menggunakan tautan publik permanen |
| Perubahan/pencabutan | Event atau mekanisme pemeriksaan ulang yang terdokumentasi |

Jika tautan unduh bertanda tangan digunakan, TTL dan jaminan pencabutannya harus ditetapkan. Pilihan awal yang lebih mudah dikendalikan adalah streaming lewat backend dengan pemeriksaan izin pada setiap permintaan.

Webhook, jika disediakan, wajib memiliki autentikasi tanda tangan, perlindungan replay, deduplikasi, dan penanganan event tidak berurutan. Webhook membantu invalidasi; tidak menggantikan pemeriksaan izin.

## 8. Penggunaan dalam kasus dan konsistensi revisi

### Tanpa penyimpanan profil tambahan

SBU menggunakan profil live untuk tampilan. Profil perusahaan sumber tidak diam-diam dijadikan salinan persisten.

### Setelah kontrak dokumen disetujui

SBU dapat menyimpan referensi bukti: perusahaan sumber, ID dokumen, revisi, kasus terkait, tujuan penggunaan, dan waktu pemilihan. Referensi tidak memberikan izin dengan sendirinya.

Hasil OCR, kutipan, dan fakta yang dipakai penilaian adalah data turunan yang tetap dapat sensitif. Penyimpanannya membutuhkan persetujuan dan kebijakan retensi baru; izin baca sumber saja tidak cukup.

- Catat halaman/bagian sumber dan revisi untuk setiap field hasil ekstraksi.
- Bedakan ekstraksi otomatis, konfirmasi pengguna, dan telaah manusia. Ketiganya bukan verifikasi resmi.
- Jika dokumen berubah ketika dianalisis, jangan menggabungkan versi: batalkan atau ulangi analisis.
- Penilaian mencatat versi aturan dan bukti yang dipakai.
- Perubahan sumber menandai penilaian lama sebagai perlu ditinjau; tidak mengubah sejarah secara diam-diam.
- Data yang belum diketahui menghasilkan “belum dapat dinilai”.
- Jangan membuat snapshot lengkap profil atau dokumen untuk audit tanpa persetujuan eksplisit atas perubahan batas penyimpanan.

## 9. Pencabutan, masa berlaku, dan retensi

Pencabutan atau kedaluwarsa koneksi harus:

1. Menghentikan pembacaan berikutnya di server sumber.
2. Menghentikan tugas agen yang masih berjalan dan mencegah publikasi hasil yang belum diserahkan.
3. Membuat SBU menandai sumber sebagai tidak lagi dapat diakses setelah mendeteksinya.
4. Menghapus cache sementara dan membersihkan tampilan privat pada pergantian akun.
5. Menangani data turunan sesuai tujuan, persetujuan, dan jadwal retensi yang telah disetujui.

Riwayat minimal dapat mencatat bahwa penilaian pernah dijalankan, tanpa menyimpan seluruh isi sumber. Retensi untuk kebutuhan hukum harus ditelaah dan dijelaskan, bukan dianggap otomatis.

Pencabutan izin tidak dapat menarik kembali file yang sudah diunduh atau ekspor yang sudah dimiliki pengguna. Batas ini harus diterangkan.

Tanpa pemberitahuan pencabutan dari sumber, SBU tidak boleh menjanjikan pembaruan tampilan seketika. TTL metadata, interval pemeriksaan, dan batas keterlambatan deteksi harus disepakati.

## 10. Kondisi gagal dan tampilan

| Kondisi | Perilaku |
---|---|
| Sesi SBU tidak sah | 401 lokal; pengguna perlu masuk |
| Belum ada pemetaan koneksi | 404 lokal; tampilkan kebutuhan penghubungan |
| Konfigurasi/token server tidak tersedia | 503 lokal; jangan meminta pengguna memasukkan token di halaman biasa |
| Token sumber salah/kedaluwarsa/dicabut | 424 lokal; koneksi perlu diperbaiki, bukan otomatis logout SBU |
| Izin sumber tidak cukup | 424 lokal; minta otorisasi yang diperlukan |
| Batas permintaan | 429; hormati `Retry-After` jika sah, hindari retry terus-menerus |
| Sumber tidak tersedia atau respons tidak sah | 503; tampilkan gangguan dan opsi mencoba lagi |
| Profil sumber kosong | Sukses dengan penjelasan “profil belum diisi” |
| Dokumen tidak tersedia atau di luar izin | Untuk kontrak dokumen baru, gunakan respons yang tidak membocorkan keberadaan dokumen pengguna lain |

Kegagalan tidak boleh diganti data contoh, profil kosong, atau klaim “terverifikasi”.

## 11. Keamanan dan audit

- Scope sekecil mungkin; token hanya di backend, bukan prompt, browser, URL, log, atau source control.
- Otorisasi kasus, koneksi, perusahaan, dan tugas agen diperiksa server.
- Peran yang dipilih sendiri dalam profil bukan bukti hak konsultan/reviewer.
- File sumber tidak boleh memerintahkan agen mengubah izin atau mengirim data ke tujuan lain.
- Pemeriksaan tipe berkas, batas ukuran/halaman, malware, dan pemrosesan terisolasi menjadi syarat fitur dokumen.
- Audit mencatat pelaku, tujuan, kasus, referensi/revisi sumber, revisi otorisasi jika tersedia, versi aturan, hasil, dan waktu; bukan token atau isi dokumen lengkap.
- Setujui penyedia OCR/AI, lokasi pemrosesan, retensi, dan penggunaan data sebelum mengirim dokumen ke layanan eksternal.
- Jangan menyatakan kepatuhan UU PDP atau jaminan enkripsi menyeluruh sebelum implementasi dan tata kelolanya ditelaah.

## 12. Kriteria penerimaan

### Tahap profil

- Pengguna yang belum login tidak dapat membaca profil.
- Akun A hanya menggunakan koneksi A; akun B tidak mendapatkan profil A.
- Hubungan akun SBU dan pemilik sumber telah dibuktikan secara eksplisit.
- Respons sumber dan pembungkus lokal sesuai kontrak.
- Profil kosong dibedakan dari kegagalan.
- Token/izin tidak valid tidak menyebabkan logout sesi SBU.
- Token tidak muncul di browser, log, kode, atau URL.
- Keberhasilan live dibuktikan pada lingkungan yang benar.

### Tahap folder/dokumen, setelah kontrak hulu disetujui

- Daftar, pencarian, metadata, pratinjau, konten, dan direct-ID sama-sama menolak dokumen di luar izin.
- Kebijakan subfolder dan dokumen baru sesuai persetujuan.
- Pemindahan dokumen, pencabutan, dan masa berlaku menghentikan akses.
- Referensi dokumen kasus pengguna lain tidak dapat digunakan.
- Agen tidak mendapat akses melebihi tugas atau izin pemilik.
- OCR dan penilaian mengacu ke revisi yang konsisten.
- Data turunan dan cache mengikuti persetujuan serta retensi.
- Hasil ekstraksi dan kesiapan tidak dipresentasikan sebagai sertifikasi resmi.

## 13. Tahapan dan keputusan yang belum ditutup

1. **Profil:** tuntaskan pembuktian pemilik, pemetaan server, dan uji live.
2. **Kontrak dokumen:** sepakati otorisasi mandiri, izin folder, revisi, pencabutan, dan operasi API.
3. **Penggunaan bukti:** tambahkan pemilihan referensi dokumen per kasus dan peninjauan revisi.
4. **OCR/analisis:** aktifkan hanya setelah persetujuan pemrosesan dan retensi.
5. **Navigator:** gunakan kemampuan yang telah berfungsi melalui alat backend terbatas.

Sebelum tahap dokumen, pemilik Ruang Simpan dan SBU perlu menyetujui: bukti hubungan akun/perusahaan, kebijakan subfolder, izin metadata/konten, kontrak API, retensi data turunan, penyedia OCR/AI, serta target waktu deteksi pencabutan.
