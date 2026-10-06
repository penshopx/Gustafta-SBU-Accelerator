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
- Framework Gustafta SBU Accelerator 2.0, sebagai rancangan arsitektur
  lanjutan, bukan bukti modul agentic atau aturan final sudah tersedia.
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

## Penyesuaian Framework 2.0

Framework melengkapi blueprint dengan Rule Engine berversi, pemetaan
KBLI/subklasifikasi/SKK, penjelasan AI, dan pemantauan pasca-terbit. Fondasi
tahap pertama tetap digunakan; framework tidak membuktikan fitur itu sudah
berjalan dan tidak menggantikan keputusan penyimpanan pengguna.

- **Rules decide, AI explains:** keputusan pemeriksaan berasal dari aturan
  deterministik yang telah ditelaah. LLM tidak menetapkan ambang, status
  kelayakan, atau aturan baru secara otomatis.
- Temuan baru perlu membawa ID aturan, versi, sumber pasal/lampiran, cakupan,
  dan status telaah. Contoh YAML yang berisi placeholder belum dapat
  diaktifkan; pemeriksaan deklaratif lama tidak otomatis menjadi aturan final.
- Kualifikasi harus mengikuti master per jenis usaha. Contoh
  “kecil/menengah/besar” dalam framework bukan alasan menetapkan K1/K2/K3
  pada kasus lama atau menganggap daftar itu berlaku untuk semua jenis usaha.
- Data atau cakupan aturan yang belum lengkap menghasilkan **belum dapat
  dinilai**, bukan klaim siap atau tidak memenuhi. Skor persiapan harus
  menjelaskan cakupan dan kekurangan data; bukan prediksi keputusan LSBU.
- Evidence Vault/OCR berarti pengolahan dokumen yang diizinkan dari Ruang
  Simpan, bukan penambahan unggahan atau fallback penyimpanan asli di SBU.
  Pemrosesan oleh layanan AI memerlukan persetujuan, batas akses, dan retensi
  hasil ekstraksi yang jelas sebelum diaktifkan.
- Simulator tanpa akun hanya cocok untuk input hipotetis/minimal pada tahap
  awal; tidak boleh membuka kasus privat atau mengambil dokumen perusahaan.
  Janji “3 menit”, testimoni, dan klaim akurasi memerlukan bukti nyata.
- Hermes/MultiClaw/OpenClaw merupakan usulan arsitektur, bukan keharusan
  mengganti stack. Jangan memasang agen dengan akses luas sebelum izin per
  kasus, batas langkah/biaya, audit, dan persetujuan tindakan tersedia.
- Tidak menyimpan kredensial OSS/SIJK atau melakukan login/submit otomatis.
  Draf dokumen keluar tetap harus ditinjau pengguna.
- Klaim tanggal pemberlakuan, cakupan kewajiban SMM/SMAP, dan tenggat komitmen
  dalam framework masih harus dicocokkan dengan teks primer serta pemicu
  operasional yang sesuai; kutipan ringkasan tidak mengaktifkan aturan.
- Paket bisnis dalam framework adalah alternatif desain, bukan perubahan
  harga atau hak akses yang sudah disetujui dan diterapkan.

Prioritas tetap katalog/matriks dengan alur telaah, kemudian Rule Engine dan
rencana aksi. OCR, simulator publik, agen, dan compliance tracker bergantung
pada sumber serta kontrak akses tersebut; tidak diaktifkan hanya dari diagram.

## Pemeriksaan

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server exec node --test test/workspace-foundation.test.mjs
pnpm --filter @workspace/gustafta-sbu run test
```

Uji fondasi memakai autentikasi pengujian terkontrol dan PostgreSQL nyata dalam
schema terisolasi. Uji tersebut bukan klaim pengujian dua akun produksi atau
keberhasilan integrasi live Ruang Simpan.
