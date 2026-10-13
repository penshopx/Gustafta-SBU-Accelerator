# Penutupan integrasi Gustafta / Ruang Simpan

**Integrasi dibatalkan.** Dokumen ini menggantikan panduan setup lama, bukan
instruksi untuk membuat token, pemetaan akun, atau mengaktifkan endpoint.
Jangan mengaktifkan ulang integrasi atau membaca profil sumber untuk membuktikan
penutupan.

Profil perusahaan lokal SBU dan penyimpanan dokumen mandiri (juga bernama
“Ruang Simpan”) tetap digunakan. Jangan menghapus profil, dokumen, akun,
database, konfigurasi Clerk, atau konfigurasi App Storage.

## Persetujuan dan batas kewenangan

1. Pemilik menyetujui pencabutan koneksi sumber khusus integrasi ini dan
   penghapusan konfigurasi SBU terkait.
2. Operator Gustafta yang berwenang memastikan koneksi/token tersebut tidak
   dipakai layanan lain sebelum mencabutnya di sistem sumber.
3. Operator SBU memastikan setiap entri konfigurasi yang akan dihapus memang
   khusus integrasi yang dibatalkan. Tidak ditemukannya pemakai di kode SBU
   bukan bukti bahwa layanan lain tidak memakainya.
4. Jika pemilik, tujuan koneksi, atau ketergantungan layanan lain belum jelas,
   hentikan penghapusan entri tersebut dan catat “belum terkonfirmasi”.

Penghapusan secret di Replit **tidak mencabut token di Gustafta**. Pencabutan
sumber harus dikonfirmasi operator Gustafta dan pemilik, tanpa mengirim token,
ID akun/koneksi, atau data perusahaan.

## Inventaris tanpa membuka nilai

Periksa development dan production secara terpisah, termasuk konfigurasi
shared yang diwariskan serta pengaturan deployment yang berjalan.
Catat hanya **nama konfigurasi, lingkungan, keberadaan, dan status persetujuan**.
Jangan membuka atau mencetak nilai token maupun isi pemetaan identitas.
Jangan membuat salinan environment, HAR, atau tangkapan layar berisi rahasia/PII.

Nama lama yang perlu diperiksa, bukan daftar yang boleh langsung dihapus:

| Nama | Jenis/tujuan lama | Batas pembersihan |
| --- | --- | --- |
| `RUANG_SIMPAN_CONNECTIONS` | Pemetaan akun ke nama secret | Hapus hanya entri integrasi yang sudah disetujui; jangan salin ID ke laporan. Hapus variabel seluruhnya hanya jika semuanya khusus integrasi ini. |
| `RUANG_SIMPAN_TOKEN_SBU` | Secret token lama | Hapus setelah operator mengonfirmasi tidak dipakai layanan lain dan pencabutan sumber disetujui. |
| `RUANG_SIMPAN_TOKEN_*` | Kemungkinan secret per pemilik | Periksa nama yang benar-benar ada; jangan menghapus dengan wildcard. |
| `SBU_RUANG_SIMPAN_ENABLED` | Flag aktivasi lama | Hapus jika ada dan terbukti khusus integrasi ini; jangan mengaturnya ke `true`. |

Periksa juga deklarasi konfigurasi proyek `.replit` secara privat agar pemetaan
lama tidak muncul lagi setelah penghapusan. Jangan menyalin nilainya ke chat,
diff yang dibagikan, atau laporan.

## Urutan penutupan

1. Dapatkan persetujuan pemilik dan konfirmasi batas penggunaan dari operator.
2. Operator Gustafta mencabut hanya koneksi/token khusus integrasi yang dibatalkan.
   Laporkan status pencabutan, bukan nilai token atau identitas koneksi.
3. Hapus pemetaan dan variabel yang disetujui melalui alur Configurations resmi.
   Bersihkan deklarasi proyek terkait hanya setelah persetujuan yang sama.
4. Hapus secret yang disetujui melalui **Tools → Secrets → menu entri → Delete**.
   Jangan mengganti nilai dengan token palsu atau string kosong.
5. Di **Publishing → Adjust settings**, operator memeriksa konfigurasi dan
   secrets production secara terpisah. Perubahan development tidak membuktikan
   deployment aktif sudah bersih. Penerapan/publishing memerlukan persetujuan
   pemilik; jangan menerbitkan perubahan otomatis.
6. Setelah perubahan development, restart workflow API sekali. Konfirmasi
   konfigurasi efektif bersih tanpa membaca nilainya.
7. Jalankan regresi lokal untuk penolakan integrasi dan keberadaan jalur
   profil/dokumen lokal. Tidak perlu membaca profil Gustafta atau menggunakan
   token lama dalam permintaan uji.

Referensi resmi: [Secrets Replit](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets)
dan [Publishing](https://docs.replit.com/features/publishing/overview).

## Bukti dan kriteria selesai

### Status pemeriksaan 13 Oktober 2026

- Pemilik menyetujui pembersihan konfigurasi khusus integrasi ini dan
  mengonfirmasi pernyataan operator bahwa koneksi sumber sudah dicabut serta
  tidak dipakai layanan lain. Ini konfirmasi pemilik, bukan pemeriksaan profil live.
- `RUANG_SIMPAN_CONNECTIONS` dan `SBU_RUANG_SIMPAN_ENABLED` telah dihapus melalui
  alur environment resmi untuk development, production, dan shared. Pemeriksaan
  ulang tidak menemukan kedua nama tersebut pada konfigurasi efektif yang
  dilaporkan alat untuk development/production. Deklarasi terkait di `.replit`
  juga sudah tidak ada.
- Pemilik melaporkan penghapusan `RUANG_SIMPAN_TOKEN_SBU` melalui UI Secrets
  development. Pemeriksaan ulang melalui alur resmi secara terpisah tidak
  menemukan secret integrasi pada development, production, maupun shared.
  Kedua nama pemetaan/flag di atas juga tidak tersedia pada ketiga lingkungan.
  Nilai token dan isi pemetaan identitas tidak dibuka.
- API development berhasil direstart. Tiga regresi lokal lulus: penolakan
  integrasi, jalur autentikasi profil/dokumen lokal, dan kontrak/frontend lokal.
- Pembersihan konfigurasi yang dilaporkan alur environment resmi selesai.
  Deployment aktif tersedia, tetapi perubahan kode belum diterbitkan. Pemeriksaan
  publik tanpa token pada jalur integrasi lama menghasilkan HTTP 401 JSON dengan
  `Cache-Control: private, no-store`, bukan HTTP 410. Ini bukan bukti kode
  penolakan integrasi sudah berlaku di production, maupun bukti isi environment
  proses production aktif. Verifikasi versi terpublikasi tetap pekerjaan terpisah;
  tidak dilakukan publishing, login, atau pembacaan profil live.

### Templat laporan akhir

Isi laporan development dan production secara terpisah dengan status
“terkonfirmasi”, “belum terkonfirmasi”, atau “tidak ada”. Jangan mengubah
“belum terkonfirmasi” menjadi “selesai” hanya karena kode integrasi ditolak.

| Pemeriksaan | Development | Production |
| --- | --- | --- |
| Persetujuan pemilik untuk pencabutan/penghapusan | Belum terkonfirmasi | Belum terkonfirmasi |
| Tidak dipakai layanan lain, dikonfirmasi operator | Belum terkonfirmasi | Belum terkonfirmasi |
| Pencabutan sumber dikonfirmasi operator dan pemilik | Belum terkonfirmasi | Belum terkonfirmasi |
| Pemetaan/flag lama bersih, termasuk shared/deklarasi proyek | Belum terkonfirmasi | Belum terkonfirmasi |
| Secret terkait tidak tersedia lagi | Belum terkonfirmasi | Belum terkonfirmasi |
| Konfigurasi efektif layanan berjalan sudah bersih | Belum terkonfirmasi | Belum terkonfirmasi |
| Jalur profil/dokumen SBU lokal tetap utuh | Belum terkonfirmasi | Belum terkonfirmasi |

Pekerjaan selesai hanya setelah pencabutan dikonfirmasi pemilik, konfigurasi
terkait bersih, dan fitur lokal SBU tetap utuh. Panduan HTML pendamping:
`docs/panduan-integrasi-live-ruang-simpan.html`.