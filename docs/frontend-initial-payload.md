# Pemuatan awal frontend — 29 Oktober 2026

## Hasil pengukuran

Build produksi lokal, basis rute `/`, versi dependensi sama:

| JavaScript aplikasi pada grafik impor awal | Sebelum | Sesudah |
| --- | ---: | ---: |
| Minified | 951.544 byte | 530.891 byte |
| Gzip | 263.484 byte | 147.979 byte |

Grafik awal dihitung dari entri HTML dan seluruh impor statis transitif dalam
manifest Vite, bukan hanya ukuran satu vendor/chunk. Penurunan kumulatif sekitar
44% untuk minified maupun gzip. Ini **bukan** pengukuran waktu muat, Core Web Vitals,
atau keseluruhan transfer jaringan (SDK eksternal Clerk, CSS, font, gambar dan
video tidak dihitung sebagai JavaScript aplikasi).

## Perubahan

- Simulator, Mini Apps, personel, konsultasi, chat, regulasi, agenda, profil
  perusahaan, Ruang Simpan, dan panel-panel kasus dimuat melalui impor dinamis.
- Halaman depan, tombol pembuka Bantuan, provider sesi dan batas kepemilikan tetap eager.
  Pemanggilan fitur privat tetap berada di lokasi penjagaan sesi/pemilik
  sebelumnya, termasuk key dan props pemilik. Tidak ada perubahan API/backend.
- Setelah pemisahan rute, grafik awal sempat menjadi 597.839 byte / 169.857 gzip.
  Panel Help Desk beserta panduan dan dialognya kemudian dipisahkan lagi:
  tombol tetap tersedia langsung, sementara modul diunduh setelah diklik.
  Setelah berhasil dimuat, komponen asli tetap terpasang sehingga menutup panel
  tidak membuang riwayat atau draf. Key identitas sebelumnya tetap menghapus
  riwayat pada pergantian akun. Panduan tetap lokal, tanpa kuota atau layanan AI.
- Pemuatan Bantuan dapat dibatalkan dengan tombol atau Escape. Kegagalan impor
  ditampilkan hanya di panel bantuan dan dapat ditutup, bukan menjatuhkan
  halaman utama. Pemulihan penuh memakai muat ulang eksplisit dengan peringatan
  isian yang belum disimpan.
- Status pemuatan tersedia. Bila modul gagal dimuat, tombol pemulihan memuat
  ulang halaman secara eksplisit disertai peringatan isian belum tersimpan.
  Membuat ulang `React.lazy` saja bukan jaminan retry jaringan untuk URL modul
  yang sama karena cache impor browser.
- Tidak menaikkan ambang peringatan Vite. Chunk awal masih melebihi 500 kB;
  peringatan ini tetap terlihat dan bukan kegagalan build.

## Pemeriksaan ulang

Dari root workspace:

```sh
PORT=26110 BASE_PATH=/ pnpm --filter @workspace/gustafta-sbu run build
pnpm --filter @workspace/gustafta-sbu run test:bundle
pnpm --filter @workspace/gustafta-sbu run typecheck
```

Nilai PORT/BASE_PATH pada perintah adalah konteks build sementara, bukan
perubahan konfigurasi tersimpan. Sesuaikan dengan konteks artefak jika berubah.

`test:bundle` menghitung seluruh grafik statis, menolak fitur yang kembali
menjadi eager, dan menegakkan anggaran maksimum 60% baseline awal untuk bytes
dan gzip. Uji browser menjalankan hasil build melalui server preview sementara,
tanpa akun, layanan eksternal atau panggilan AI berbayar. Uji ini memeriksa
Simulator/Mini Apps, Help Desk, tidak dimuatnya modul privat yang belum dibuka,
dan pemulihan setelah satu permintaan modul digagalkan. Untuk Help Desk,
pengujian browser menahan unduhan modul agar pembatalan dapat diperiksa,
memastikan tidak ada unduhan panel sebelum klik, memeriksa fokus dan
riwayat/draf saat tutup–buka, serta menggagalkan unduhan panel dan memulihkannya
tanpa memanggil layanan eksternal.

Sebanyak 37 pengujian komponen terfokus juga lulus: pemuatan tertunda, pemilik
yang berubah saat modul masih ditunggu, pelepasan komponen, cache akun, pembacaan
privat, formulir profil, Help Desk dan regulasi. Tidak ada pengujian login nyata
atau dokumen pelanggan pada pekerjaan ini.

Pada tahap Help Desk, typecheck dan 13 pengujian terfokus (panduan, komponen
asli melalui launcher baru, impor tertunda dan penjagaan akun) lulus, bersama
pengujian browser hasil build di atas. Jumlah ini tidak dijumlahkan dengan
37 tes tahap sebelumnya karena sebagian skenarionya tumpang tindih.

Tidak ada publikasi atau klaim verifikasi produksi.
