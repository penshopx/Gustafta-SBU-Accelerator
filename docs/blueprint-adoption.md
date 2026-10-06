# Penerapan blueprint SBU Accelerator

## Hasil penelaahan

Blueprint relevan untuk mengembangkan pencatatan persiapan menjadi workbench
yang memiliki katalog, matriks persyaratan, personel, dan tindakan yang dapat
ditindaklanjuti. Ini bukan bukti validasi pasar atau kelayakan rilis berbayar.
Paket prompt meminta satu tahap per sesi dan pemeriksaan kriteria terima
sebelum beralih ke tahap berikutnya.

## Tahap pertama yang diterapkan

- Fondasi ruang kerja privat dan wadah kasus bawaan per identitas pemilik.
- Backfill `client_id` tanpa mengubah isian kasus yang sudah ada.
- Konteks akses server dan pemeriksaan pemilik lama tetap digunakan.
- Fondasi pengaturan aplikasi dan audit transaksi CRUD kasus.
- Disclaimer global dan informasi wadah privat di Pengaturan.

Wadah bawaan tidak dianggap sebagai satu perusahaan nyata: kasus lama dapat
memiliki nama perusahaan berbeda. Jenis usaha, NIB, NPWP tersamar, dan alamat
tidak diisi dari dugaan atau ditarik otomatis dari profil Ruang Simpan.
Kualifikasi “Kecil” tidak otomatis dikonversi menjadi K1/K2/K3.

## Sumber yang diterima

- Blueprint dan Paket Prompt Replit SBU Accelerator.
- Pustaka kasus berisi 150 kode unik: 50 SBU, 50 SKK, 50 perizinan.
  Semua berstatus **Draf** dan berasal dari **Skenario studi banding**.
  Data belum diimpor atau dipublikasikan sebagai kasus nyata/aturan final.
- Pustaka kasus bukan pengganti teks primer dan matriks persyaratan resmi.
  Paket regulasi yang ditautkan dalam blueprint belum tersedia sebagai ekspor
  lengkap pada tahap ini.

## Batas penerapan berikutnya

- Dokumen asli tetap hanya di Ruang Simpan sesuai keputusan pengguna.
  Tidak ada fallback file lokal atau penyimpanan dokumen asli di SBU.
- Akses live Ruang Simpan tetap terpisah dan belum dianggap selesai.
- Clerk yang dikelola Replit tidak menyediakan organisasi tenant. Fondasi
  privat ini tidak memberikan undangan anggota atau akses lintas akun.
- Persyaratan/skor final menunggu sumber dan telaah berwenang. Skor persiapan
  bukan peluang lolos, penilaian resmi, atau jaminan SBU.
- Harga, pembayaran Scalev, tutor AI, direktori, dan handoff belum diterapkan.
- Klinik/Workroom Gustafta OS tidak dibangun ulang dalam aplikasi SBU.

## Pemeriksaan

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server exec node --test test/workspace-foundation.test.mjs
pnpm --filter @workspace/gustafta-sbu run test
```

Uji fondasi memakai autentikasi pengujian terkontrol dan PostgreSQL nyata dalam
schema terisolasi. Uji tersebut bukan klaim pengujian dua akun produksi atau
keberhasilan integrasi live Ruang Simpan.
