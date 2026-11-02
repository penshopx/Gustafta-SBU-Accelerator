# Penerapan blueprint SBU Accelerator

## Keputusan produk terbaru — 9 Oktober 2026

SBU Accelerator adalah aplikasi mandiri yang terpisah dari Gustafta.my.id. Profil perusahaan
diisi langsung di aplikasi dan dokumen asli boleh disimpan privat di SBU.
Integrasi dengan Gustafta.my.id/Ruang Simpan dibatalkan untuk fase saat ini.
Integrasi baru dipertimbangkan pada fase pengembangan berikutnya setelah kedua
aplikasi sama-sama teruji dalam praktik penggunaan nyata, dengan keputusan baru pengguna.
Konsep Ruang Simpan, Bedah Dokumen, Klinik Konsultasi, Workroom, dan fitur Gustafta
lain yang relevan dikembangkan langsung di SBU, bukan disediakan melalui koneksi ke Gustafta.
Keputusan ini menggantikan rencana integrasi setelah produk matang dan batas penyimpanan “hanya Ruang Simpan” pada
catatan historis di bawah. Unggahan tidak menjadi bukti terverifikasi atau
persetujuan sertifikasi. Rincian batas dan pengamanan berlaku di `replit.md`.

## Hasil penelaahan

### Kurasi katalog fitur untuk persiapan SBU

Daftar fitur ekosistem merupakan referensi konsep, bukan bukti kewajiban hukum,
lisensi produk, integrasi aktif, atau izin mengubah hak akses. Keputusan kurasi:

| Referensi | Keputusan | Penerapan / batas dalam SBU Accelerator |
| --- | --- | --- |
| Kasus SBU, Simulator, Mini Apps | Digunakan kembali | `/cases`, `/simulator`, `/mini-apps`; persiapan baru/perpanjangan, bukan pengajuan atau penerbitan. |
| Ruang Simpan | Digunakan kembali | `/documents`; dokumen privat terkait kasus, bukan arsip umum atau berbagi tim. Adapter integrasi lama tetap nonaktif. |
| Bedah Dokumen | Digunakan kembali | Tindakan di alur dokumen; pilih kasus, dokumen, versi, halaman dan persetujuan. Tidak membuat rute atau tombol pemrosesan langsung baru. |
| Klinik Konsultasi, Asisten | Digunakan kembali | `/consultations` dan `/assistant`; bantuan AI lokal dengan persetujuan, bukan konsultan manusia atau akses otomatis seluruh dokumen. |
| Workroom / ruang kerja / tinjauan internal | Digunakan kembali | Bagian detail kasus yang dipilih pemilik; bukan halaman baru, dashboard klien bersama atau persetujuan lembaga. |
| Personel & SKK, jalur SBU–SKK | Relevan terbatas | `/personnel` bersama Kasus dan Simulator; catatan sertifikat/penugasan, bukan verifikasi kecocokan resmi, pengajuan, pelatihan, PKB atau penerbitan SKK. |
| Regulasi, legalitas/OSS, E-SIMPAN, SIMPK, asosiasi | Relevan terbatas | Sumber terkurasi, catatan bukti dan konteks persiapan; bukan koneksi akun, pemeriksaan status resmi atau pengiriman eksternal. |
| LKUT–PUB, ISO / SMAP / PANCEK | Relevan terbatas | Konteks persiapan bersumber dan checklist internal yang tersedia; tidak membangun pelaporan, modul ISO atau menetapkan edisi/kewajiban baru dari daftar fitur. |
| Agenda, tindak lanjut | Digunakan kembali | `/agenda` dan tindakan dalam kasus; nama penanggung jawab tidak memberikan akses atau pemberitahuan otomatis. |
| EXUM | Relevan terbatas | Hanya inspirasi ringkasan persiapan yang sudah ada di kasus, bukan layanan baru atau executive summary terverifikasi. |
| Tender, proyek umum, portfolio, LKPM | Diabaikan untuk lingkup sekarang | Tidak menambah menu, modul pelaporan atau janji memenangkan/menjalankan proyek. Topik bantuan yang sudah ada bukan layanan pengajuan. |
| LexCom, Brain Project, KonstruksiAI, Ebook, Bimtek, produk / paket berlangganan / marketplace | Diabaikan untuk lingkup sekarang | Tidak disalin sebagai menu, layanan hukum, pelatihan, katalog komersial atau pembayaran. |

Landing menjelaskan manfaat bagi badan usaha/kontraktor dan konsultan/pendamping,
tanpa mengubah peran atau akses per akun. Semua tautan menunjuk modul lokal yang
sudah ada; kasus, dokumen dan konteks dipilih setelah masuk. Simulator dan Mini
Apps tetap publik. Fitur privat tetap melewati penjagaan sesi, persetujuan dan
otorisasi lama; daftar fitur bukan izin membuka kembali integrasi Gustafta.my.id.

Catatan historis di bawah tetap merekam tahapan blueprint lama. Untuk status
penyimpanan dan modul saat ini gunakan keputusan produk terbaru di atas dan
batas operasional di `replit.md`, bukan larangan storage lama di bagian historis.

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
  Paket teks/metadata regulasi tersedia sebagai draf kurasi. PDF asli tiga
  sumber utama sudah diterima dan dicocokkan dengan manifest. Lampiran PP
  susulan termasuk matriks sektor PU juga sudah diterima; sumber pelengkap
  serta telaah persyaratan masih belum lengkap. Rincian pemeriksaan di bawah.

## Pemeriksaan paket tambahan — 6 Oktober 2026

Sebelas arsip tambahan diperiksa melalui daftar isi, metadata, perbandingan
konten, dan pembacaan JSONL/CSV. Arsip tidak diekstrak menimpa proyek; tidak ada
impor database, perubahan fitur, atau penerbitan korpus pada pemeriksaan ini.

### Duplikasi dan pustaka kasus

- Isi Markdown blueprint dan paket prompt identik dengan unggahan sebelumnya.
- Dua ZIP `Pustaka_Kasus_SBU_Accelerator_150_Draf` identik byte demi byte.
  Gunakan satu paket, bukan dua impor terpisah.
- Ekspor CSV SBU, SKK, dan perizinan masing-masing berisi 50 baris. Pasangan
  CSV biasa dan `_all.csv` memiliki himpunan rekaman yang sama dengan urutan
  berbeda; bukan tambahan kasus baru.
- JSONL gabungan sama dengan penggabungan tiga JSONL per modul. Ada tepat
  150 kode unik: tiap modul berisi 20 Baru, 15 Perpanjangan, 15 Perubahan data.
  Seluruhnya Draf, asal Skenario studi banding, dengan hasil aktual dan sumber
  kejadian kosong. CSV adalah ringkasan; JSONL memuat bahan diagnosis/langkah.

### Knowledge Pack

- Register berisi 20 sumber: metadata menyebut 19 PDF dan satu aset gambar.
  Ada 18 kandidat sumber regulasi/pendukung; materi penjualan dan logo
  dikecualikan. Jumlah tersebut bukan 20 peraturan final.
- Data memuat 2.371 rekaman halaman dan 1.326 potongan kandidat. Pemeriksaan
  seluruh rekaman menemukan ID unik, referensi dokumen induk yang tersedia,
  dan rentang halaman yang sesuai jumlah halaman dalam register.
- Seluruh dokumen dan potongan berstatus draf; potongan belum terbit dan
  `use_for_rules_engine` bernilai false. Ada 117 halaman ditandai minim teks.
  Konsistensi struktur bukan verifikasi hukum, OCR, atau ketepatan isi tabel.
- Knowledge Pack yang ditautkan di ZIP pustaka regulasi identik dengan paket
  Knowledge Pack terpisah. Tidak perlu mengimpor keduanya.
- PDF asli tidak ada di arsip. Hash dalam manifest belum dapat dicocokkan
  dengan PDF asli. `session-file://` bukan tautan produksi; anotasi pemeriksaan
  visual adalah catatan dari penyusun, bukan pemeriksaan visual ulang di SBU.

### PDF asli susulan — 6 Oktober 2026

Penerimaan ulang 14 PDF pada 26 Oktober 2026 dicatat terpisah di
[`knowledge-intake-2026-10-26.md`](knowledge-intake-2026-10-26.md), termasuk
deduplikasi hash, peran sumber dan konflik identitas sampul paparan.
Penerimaan ini tidak mengaktifkan sumber atau aturan baru.

Tiga PDF susulan dicocokkan secara SHA-256 dengan manifest Knowledge Pack.
Semua cocok persis; ini mengonfirmasi kesamaan berkas dengan bahan ekstraksi,
bukan validasi tanda tangan elektronik atau verifikasi status hukum terkini.

| Sumber | Halaman PDF | SHA-256 | Hasil pencocokan |
| --- | ---: | --- | --- |
| PP 28/2025 (`SBU-SRC-001`) | 383 | `8808de485eab2499cf3d8369921c097beaea68ae55aa767c61095d47a5a118fb` | Cocok |
| Permen PU 6/2025 (`SBU-SRC-002`) | 393 | `117f681ebd049e02d886864e49ad20104cfd4001f613e2c208271a80eec81d47` | Cocok |
| Kepdirjen BK 281/KPTS/DK/2026 beserta surat pengantar (`SBU-SRC-003`) | 186 | `8055de1c63f7139a680540ae6da789c663029b4a5d1683a1e2ca28a4259a588f` | Cocok |

Pemeriksaan terarah menggunakan teks dan gambar halaman:

- PP: identitas pada halaman PDF 1; penjelasan dimulai pada halaman PDF 311
  dan salinan berakhir pada halaman PDF 383. Matriks lampiran yang dibutuhkan
  untuk ketentuan spesifik belum ditemukan dalam salinan ini.
- Permen: identitas pada halaman PDF 1; Pasal 20 pada halaman PDF 12 dan
  Pasal 21 pada halaman PDF 13. Pasal 21 ayat (2) menghitung enam bulan
  konversi sejak surat Pasal 20 ayat (2), bukan sejak tanggal keputusan.
  Tanggal pengundangan 30 Desember 2025 dan Berita Negara 2025 Nomor 1142
  dicocokkan visual pada halaman PDF 16 karena ekstraksi teks tidak lengkap.
- Kepdirjen: identitas pada halaman PDF 3 dan Diktum Keenam pada halaman PDF 5
  dibaca secara visual karena halaman scan tidak memiliki teks native.
  Surat pengantar pada halaman PDF 1 tertanggal 28 Agustus 2026; butir 2
  mensyaratkan penyesuaian SIJK dan diterbitkannya surat pimpinan unit.
  Surat pengantar tersebut bukan bukti tanggal dimulainya operasional SIJK.
- Lampiran Kepdirjen bagian 2.1.3 pada halaman PDF 15 menyebut subkualifikasi
  kecil 1/2/3 untuk Pekerjaan Konstruksi. Tabel konsultansi bagian 2.1.5 pada
  halaman PDF 16 memakai K/M/B untuk BUJKN, dengan cakupan berbeda bagi
  BUJK PMA/KPBUJKA. Tabel itu diperiksa visual; semua ambang persyaratan dan
  seluruh tabel lain belum ditelaah satu per satu.

Unggahan ini adalah bahan penelaahan di workspace, bukan pemasangan dokumen
ke storage SBU atau tautan sitasi produksi. Tidak ada perubahan tanggal
transisi, kualifikasi kasus, aturan aktif, atau data perusahaan.
Pemeriksaan dapat diulang dengan
`python .agents/scripts/check-regulatory-originals.py`; gambar sementara
ditulis ke `/tmp/sbu-original-pdf-review`, bukan ke storage aplikasi.

### Lampiran PP susulan — 6 Oktober 2026

20 PDF susulan memuat 10.462 halaman. Lampiran I.H (515 halaman), termasuk
contoh tabel jasa konstruksi I.H.8–I.H.9, sudah diperiksa secara terarah.
Gap ketersediaan bahan matriks sektor PU kini menjadi **sumber diterima,
menunggu telaah**, bukan lagi belum ada lampiran. Lampiran II kemudian
diterima (746 halaman); unggahan ulang III/IV identik dengan berkas sebelumnya.
Inventaris kini berisi 21 PDF unik dan 11.208 halaman, bukan 23 sumber berbeda.
Penamaan rentang berkas terakhir I.F berbeda dari isi aktual.
Inventaris, batas pemeriksaan, dan catatan kelengkapan tercatat di
[Pemeriksaan lampiran PP 28/2025](pp28-annex-review.md).

### Gerbang sebelum penerapan regulasi

- Lengkapi sumber yang menurut paket belum tersedia: surat pemicu operasional
  SIJK, teks mandiri UU Jasa Konstruksi beserta perubahannya, PP 22/2020 jo.
  PP 14/2021, dan Permen PUPR 8/2022. Lampiran II dan matriks sektor PU
  PP 28/2025 sudah tersedia; telaah cakupan dan tabel sebelum menerapkan aturan.
- Verifikasi nomor/tahun, hubungan perubahan/pencabutan, cakupan jenis usaha,
  locator pasal/lampiran, serta pasangan baris/kolom tabel dari sumber primer.
  Jangan menghitung tenggat transisi dari tanggal keputusan atau paparan.
- Pisahkan regulasi primer, referensi klasifikasi BPS, panduan operasional,
  dan praktik lembaga. Checklist skenario bukan persyaratan universal.
- Sesuaikan instruksi storage dalam paket: dokumen asli tetap hanya di Ruang
  Simpan. Jangan mengikuti usulan unggah PDF ke storage SBU; tautan sumber
  harus memakai referensi yang diizinkan, bukan URI lampiran sesi.
- Bahan ini dapat menjadi masukan area kurasi draf untuk katalog/matriks,
  tetapi belum menjadi syarat aktif, jawaban tutor terverifikasi, atau bukti
  aplikasi sudah layak dijual. Publikasi menunggu telaah berwenang.

## Batas penerapan berikutnya

Telaah terarah contoh gedung hunian (KBLI 41011, BG001/GT001) sudah
dicatat dalam [Draf matriks SBU](sbu-requirements-review.md). Pemetaan awal
mencakup jenis usaha, pilihan kualifikasi, peran TKK, dan batas interpretasi
waktu penerbitan. Ini bahan kurasi, bukan katalog atau aturan aktif.

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
