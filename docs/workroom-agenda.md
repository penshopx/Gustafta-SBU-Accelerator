# Agenda Persiapan SBU

## Tujuan dan akses

Buka **Kasus SBU → pilih kasus → Ruang kerja kasus**. Agenda membaca
tindakan yang sudah disimpan di ruang kerja; tidak membuat daftar persyaratan
baru, mengubah penilaian, atau menyatakan kesiapan sertifikasi.

Untuk melihat semua kasus milik satu akun sekaligus, buka **Agenda kasus**
di navigasi (alamat `/agenda`). Hasil dibatasi di server oleh identitas login
dan kasus yang dimiliki akun yang sama; profil akun lain tidak ditampilkan.
Pengguna tanpa peran pemilik kasus tidak mendapat menu ini. Halaman membaca
20 tindakan per halaman, menyediakan pencarian kata literal pada judul,
penanggung jawab, nama perusahaan, atau klasifikasi dan filter
aktif/terlewat/hari ini/7 hari/tanpa tenggat/selesai/semua. Baris membawa
pengguna ke kasus untuk memperbarui tindakan; ia tidak menyimpan salinan data
terpisah. Muat ulang atau fokus jendela untuk mengambil perubahan dari sesi
lain. Total dan isi halaman adalah snapshot satu permintaan; perpindahan
halaman setelah perubahan paralel dapat menggeser posisi tindakan.

- Prioritas: terlewat, hari ini, tujuh hari ke depan, mendatang, tanpa tenggat.
- Pencarian judul, penanggung jawab, dan keterangan; filter status/urgensi.
- Tambah dan ubah menggunakan formulir ruang kerja yang sudah ada. Perubahan
  tetap disimpan melalui API terautentikasi dengan pemeriksaan pemilik/revisi.
- Tindakan selesai tidak lagi masuk daftar aktif; dapat dilihat lewat filter
  Selesai. Tanggal tidak sah diberi peringatan, bukan diganti diam-diam.
- Acuan urgensi adalah tanggal WIB (Asia/Jakarta), diperbarui saat fokus,
  tab kembali terlihat, atau pemeriksaan berkala. Tanggal kalender tidak
  dikonversi menjadi waktu lokal perangkat.

## Kalender pribadi

Setelah menyetujui pemberitahuan privasi, pengguna dapat mengunduh
`agenda-sbu-kasus-<id>.ics`. Ekspor mencakup **semua tindakan aktif bertenggat
valid**, tidak hanya yang sedang terlihat dalam pencarian/filter.

Berkas memuat judul tindakan, tanggal satu hari penuh, identitas teknis event,
revisi, dan penjelasan batas penggunaan. Tidak memuat keterangan tindakan,
penanggung jawab, isi dokumen, URL privat, atau kredensial. Judul tetap dapat
berisi informasi privat; pengguna perlu memeriksanya sebelum mengimpor.
Mengimpor ke aplikasi kalender dapat mengirim data tersebut ke penyedianya.
Label `PRIVATE` bukan enkripsi atau pembatasan akses terhadap berkas.

Ini ekspor satu kali: **bukan sinkronisasi, bukan notifikasi otomatis, dan
bukan tenggat resmi LSBU/OSS**. Perubahan atau penghapusan tindakan di aplikasi
tidak memperbarui kalender luar. Periksa/hapus event lama secara manual;
perilaku impor ulang bergantung pada aplikasi kalender dan belum diverifikasi.
Persetujuan ekspor dibatalkan saat kasus atau data yang akan diekspor berubah.

Tidak menggunakan AI, integrasi Gustafta, penyimpanan browser permanen,
database baru, atau pengiriman eksternal otomatis.

## Pemeriksaan lokal

```sh
pnpm --filter @workspace/gustafta-sbu exec node --import tsx --test src/lib/workroom-agenda.test.ts src/components/workroom-agenda.test.tsx
pnpm --filter @workspace/gustafta-sbu typecheck
```

Uji terisolasi mencakup prioritas/tanggal WIB, filter, tanggal rusak, ekspor
lintas kasus yang ditolak, escaping dan lipatan UTF-8 kalender, persetujuan
terikat data, callback tambah/ubah, kegagalan unduhan, dan pembersihan URL.
Pemeriksaan ini bukan bukti aplikasi kalender pihak ketiga atau produksi.
