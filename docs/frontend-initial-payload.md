# Pemuatan awal frontend — 29 Oktober 2026

## Hasil pengukuran

Build produksi lokal, basis rute `/`, versi dependensi sama:

| JavaScript aplikasi pada grafik impor awal | Sebelum | Sesudah |
| --- | ---: | ---: |
| Minified | 951.544 byte | 597.839 byte |
| Gzip | 263.484 byte | 169.857 byte |

Grafik awal dihitung dari entri HTML dan seluruh impor statis transitif dalam
manifest Vite, bukan hanya ukuran satu vendor/chunk. Penurunan sekitar 37%
minified dan 36% gzip. Ini **bukan** pengukuran waktu muat, Core Web Vitals,
atau keseluruhan transfer jaringan (SDK eksternal Clerk, CSS, font, gambar dan
video tidak dihitung sebagai JavaScript aplikasi).

## Perubahan

- Simulator, Mini Apps, personel, konsultasi, chat, regulasi, agenda, profil
  perusahaan, Ruang Simpan, dan panel-panel kasus dimuat melalui impor dinamis.
- Halaman depan, Help Desk, provider sesi dan batas kepemilikan tetap eager.
  Pemanggilan fitur privat tetap berada di lokasi penjagaan sesi/pemilik
  sebelumnya, termasuk key dan props pemilik. Tidak ada perubahan API/backend.
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
menjadi eager, dan menegakkan anggaran maksimum 75% baseline awal untuk bytes
dan gzip. Uji browser menjalankan hasil build melalui server preview sementara,
tanpa akun, layanan eksternal atau panggilan AI berbayar. Uji ini memeriksa
Simulator/Mini Apps, Help Desk, tidak dimuatnya modul privat yang belum dibuka,
dan pemulihan setelah satu permintaan modul digagalkan.

Sebanyak 37 pengujian komponen terfokus juga lulus: pemuatan tertunda, pemilik
yang berubah saat modul masih ditunggu, pelepasan komponen, cache akun, pembacaan
privat, formulir profil, Help Desk dan regulasi. Tidak ada pengujian login nyata
atau dokumen pelanggan pada pekerjaan ini.

Tidak ada publikasi atau klaim verifikasi produksi.
