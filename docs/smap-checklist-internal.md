# Checklist internal SMAP

## Akses

Masuk sebagai pengguna yang dapat mengelola Kasus SBU, buka suatu kasus,
lalu bagian **Checklist internal SMAP**. Katalog Mini Apps SBU juga
menyediakan tautan menuju daftar kasus.

Checklist merupakan alat bantu persiapan dari contoh, bukan aktivasi
persyaratan normatif. Identitas peraturan induk dan keberlakuan contoh
belum dipastikan. Tidak ada skor kelulusan, penerbitan lembar konfirmasi
PANCEK, sertifikasi ISO, pengiriman eksternal atau panggilan AI.

## Alur

1. Pilih satu dari 23 pertanyaan dalam empat kelompok.
2. Catat deklarasi Ada/Tidak ada/Belum dijawab dan catatan.
3. Pilih sampai 10 referensi dokumen dari kasus yang sama. Hanya versi
   terbaru yang siap dan lolos pemindaian tersedia sebagai pilihan.
   Unggah dokumen terlebih dahulu melalui fasilitas dokumen/Ruang Simpan
   yang sudah ada, dengan kaitan ke kasus yang sesuai.
4. Simpan deklarasi. Penyimpanan membuat revisi baru dan status
   belum ditelaah; hasil penilaian SBU tidak diubah.
5. Lakukan tindakan telaah terpisah dengan catatan. Status Memadai
   memerlukan jawaban dan bukti, tetapi tidak berarti bukti autentik
   atau pemenuhan hukum telah diverifikasi resmi.
6. Lihat 50 revisi terakhir per butir. Pengosongan deklarasi membuat
   revisi baru, tidak menghapus riwayat.

Tautan bukti terikat versi dan fingerprint metadata. Perubahan metadata,
status keamanan, versi pengganti atau penghapusan membuat rujukan lama
ditandai perlu telaah ulang. Keputusan lama tetap melekat pada snapshot
historis; ia bukan keputusan atas bukti yang baru.

## Batas teknis

- Revisi disimpan append-only pada tabel khusus; identitas penelaah
  dan waktu berasal dari sesi/server.
- Pemeriksaan kepemilikan kasus, pemilik dokumen, status aman dan
  header pemilik formulir dilakukan server-side. Header bukan autentikasi.
- `revision` melindungi draf dari penyimpanan bersamaan. Konflik 409
  mempertahankan draf pengguna dan memerlukan pemuatan ulang eksplisit.
- Pembacaan memakai snapshot repeatable-read. Penulisan diserialisasi
  dengan kunci kasus dalam transaksi singkat tanpa panggilan layanan luar.
- Refresh berkala/fokus memperbarui status tanpa menimpa draf kotor.
- Snapshot menyimpan metadata referensi dan catatan, bukan byte dokumen
  atau salinan berkas. Nama dan catatan pada riwayat tetap data privat.
- Penelaah saat ini adalah akun pemilik yang sah, bukan role LSBU,
  reviewer independen atau persetujuan multipihak.
- Ringkasan persiapan unduh HTML dan cetak/PDF memuat 23 butir SMAP,
  locator sumber contoh, versi template, deklarasi/catatan, revisi terakhir,
  keputusan/catatan telaah serta ID akun penelaah dan waktunya.
  Riwayat lengkap tetap di halaman kasus.
- Status rujukan dokumen dan checklist dibaca dalam transaksi repeatable-read
  yang sama dengan kasus, personel dan bukti. Rujukan berubah/tidak tersedia
  ditandai perlu tinjauan ulang; keputusan lama tidak dihapus atau dinyatakan
  masih memadai. Ekspor tidak mengubah assessment, evidence atau revisi SMAP.
- Catatan SMAP dan identitas penelaah ikut keluar ke perangkat saat unduh/cetak.
  Pemberitahuan sebelum ekspor menjelaskan hal ini. Berkas asli, fingerprint,
  lokasi storage, tautan unduh dan catatan privat modul lain tidak disertakan.
  Salinan ekspor bersifat privat dan tidak mengikuti perubahan berikutnya.

## Kontrak dan pemeriksaan

Kontrak berada di `lib/api-spec/openapi.yaml`, dengan GET checklist,
PUT deklarasi, POST telaah, dan GET riwayat pada
`/api/cases/:id/smap-checklist`.

Migrasi tambahan idempoten dijalankan melalui migrator workspace yang
sudah ada. Tidak ada perubahan otomatis pada kasus atau evidence lama.

Pemeriksaan terfokus:

```sh
pnpm --filter @workspace/api-server exec node --test test/smap-checklist-postgres.test.mjs
pnpm --filter @workspace/gustafta-sbu exec node --import tsx --test src/components/case-smap-checklist.test.tsx src/components/mini-apps-page.test.tsx
pnpm --filter @workspace/api-server typecheck
```

Uji PostgreSQL menggunakan skema dan akun terbatas yang terisolasi.
Uji komponen memakai transport sintetis; bukan bukti layanan PANCEK,
sertifikat perusahaan, atau produksi telah diverifikasi.

Dasar kurasi: [kartu SMAP/PANCEK](knowledge-cards-smap-pancek-draft.md)
dan [matriks rancangan](smap-checklist-evidence-matrix-draft.md).

Untuk pemeriksaan pada build terpublikasi, ikuti
[prosedur uji privat produksi](production-private-smoke-test.md).
Prosedur tersebut belum dieksekusi dan mensyaratkan autentikasi serta
pembersihan fixture yang benar-benar menargetkan produksi.
