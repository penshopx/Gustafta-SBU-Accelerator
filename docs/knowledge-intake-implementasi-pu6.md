# Materi diskusi Implementasi Permen PU No. 6 Tahun 2025

## Identitas dan batas sumber

- Berkas unggahan: `NEW_PK-2026-1._Implementasi_Permen_PU_6_OK_1793785998101.pdf`.
- Salinan: 91 halaman, 33.387.216 byte.
- SHA-256: `d73f21bdf0432577b7d1daa7f1f7afc1c8a3217ef8b348cdc2f8283db4b60041`.
- Kurasi: 4 November 2026; versi `implementasi-pu6-20261104-r1`.
- Sampul menyebut **MATERI DISKUSI**. Penerbit, tanggal paparan dan keaslian
  salinan belum diautentikasi. Tanggal metadata PDF bukan tanggal penetapan.
- Peran sumber: **panduan**, bukan peraturan baru atau sumber primer.
  Baseline adalah penerimaan editorial cuplikan, bukan verifikasi hukum.

## Metode

Ekstraksi teks seluruh PDF hanya menghasilkan sekitar 6 KB: banyak isi
berupa gambar. Lembar kontak visual halaman 1–90 dipakai untuk orientasi;
halaman yang diringkas (25, 32, 44, 57, 67, 69, 81) diperiksa pada render
lebih besar, disertai halaman 74 untuk membandingkan uraian SMAP.
Halaman 91 tidak menjadi sumber ringkasan. Ini **bukan** OCR lengkap,
indeks seluruh teks, atau validasi setiap tabel dalam 91 halaman.
Tidak ada pengiriman PDF ke AI berbayar.

## Cuplikan dan penggunaan fitur

| Halaman PDF | Topik | Referensi fitur, bukan perubahan aturan |
| --- | --- | --- |
| 25 | Bahan LKUT per kelompok kualifikasi | Panduan persiapan LKUT; bukan bukti laporan diterima atau pengingat tenggat baru |
| 32 | PUB umum dan khusus | Panduan pencatatan kegiatan/pendampingan PUB; frekuensi dan kewajiban perlu sumber primer |
| 57 | Penjualan, keuangan, TKK, peralatan | Simulator, Kasus, Personel/SKK; tidak mengaktifkan ambang atau pemetaan SKK |
| 67 | Pencatatan peralatan | Referensi bahan SIMPK/SIJK; status slide tidak sama dengan status bukti lokal |
| 69 | SMAP, asosiasi, pemilik manfaat; LKUT/PUB perpanjangan | Checklist bahan persiapan, bukan putusan kelengkapan/kelayakan resmi |
| 81; pembanding 74 | Bukti dan pendampingan SMAP | Dokumen/sertifikat dan catatan SMAP; bukan sertifikasi atau persamaan Pancek–ISO |
| 44 | Ketentuan peralihan | Penjelasan transisi; bukan surat pemicu, tanggal operasional, atau keputusan pencabutan |

Nomor di atas adalah **halaman PDF**, bukan nomor slide yang mungkin
tercetak di gambar. Kutipan menyimpan locator, batasan, dan versi salinan.
Katalog Pusat Pengetahuan dan retrieval Asisten menggunakan sumber berversi
yang sama, mengikuti ledger penarikan/penggantian yang sudah ada.
Fitur deterministik tidak otomatis memakai korpus chat sebagai aturan.

## Perbedaan yang tidak diselesaikan oleh unggahan

Halaman 81 menyebut **ISO 37001:2025**. Ini tidak membuktikan edisi
SNI/ISO yang wajib, tidak mengganti rujukan sebelumnya secara diam-diam,
dan tidak menyelesaikan variasi uraian bukti SMAP antar materi.
Komitmen dan tenggat pada halaman 74 memerlukan telaah penerapan terpisah.
Tenggat LKUT pada halaman 25 tidak diaktifkan sebagai aturan kalender baru.
Halaman 44 tidak menggantikan surat pemberlakuan Pasal 20 ayat (2).
Angka kualifikasi, proyeksi, durasi proses dan tabel lain tidak diindeks
sebagai ambang penilaian. Tidak ada gerbang verifikasi transisi yang berubah.

## Arsip dan operasi

PDF asli ditempatkan pada App Storage privat dengan identitas SHA yang sama,
melalui skrip create-only `artifacts/api-server/scripts/publish-knowledge-pdfs.ts`.
Tidak ada bytes PDF di bundle aplikasi atau database. Batas khusus salinan
ini sebesar ukuran aslinya; batas default arsip lain 8 MiB dan batas
unggah dokumen pengguna 20 MiB tidak dinaikkan.
Parser, jumlah halaman, signature, EOF, dimensi dan SHA diperiksa sebelum
pengarsipan. Pemeriksaan format bukan pemindaian antivirus atau keaslian.
Pembacaan tetap melalui sesi/pemilik dan versi sumber aktif; penarikan
sumber menutup akses. Tidak ada URL bucket publik.
Menjalankan skrip arsip bukan publikasi aplikasi.
