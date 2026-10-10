# Telaah awal matriks SBU — gedung hunian

## Status dan cakupan

**Draf telaah sumber, bukan katalog aktif atau pendapat hukum final.**
Pemeriksaan ini menghubungkan satu contoh KBLI dengan beberapa sumber primer
yang diunggah. Tidak mencakup seluruh subklasifikasi, seluruh ambang
kualifikasi, ataupun pemeriksaan status hukum terkini terhadap penerbit.

Tidak ada impor database, publikasi aturan, perubahan nilai kasus, atau
penilaian kelayakan perusahaan. Dokumen asli tidak dipindahkan ke storage SBU.

Nomor PDF di bawah adalah nomor halaman berkas unggahan, bukan selalu nomor
halaman tercetak. Referensi lokal ini untuk kurasi, bukan tautan sitasi publik.

## Halaman yang diperiksa visual

| Sumber | Halaman PDF | Locator tercetak |
| --- | --- | --- |
| PP 28/2025, Lampiran I.H | 8 | I.H.8, baris KBLI 41011 |
| Permen PU 6/2025 | 17 | Lampiran I, A.1, KBLI 41011, angka 1 |
| Permen PU 6/2025 | 18 | A.1, KBLI 41011, angka 3.a–3.e |
| Permen PU 6/2025 | 20 | A.1, KBLI 41011, angka 4–5; tabel masih berlanjut |
| Kepdirjen BK 281/KPTS/DK/2026 | 15 | Halaman tercetak 6, bagian 2.1.3 |
| Kepdirjen BK 281/KPTS/DK/2026 | 16 | Halaman tercetak 7, bagian 2.1.5 |

Identitas berkas dan hash sumber utama tercatat dalam blueprint-adoption.md;
identitas/hash Lampiran I.H tercatat dalam pp28-annex-review.md.
Ekstraksi teks membantu pencarian, tetapi tabel dan kode di atas dibaca visual.

## Matriks kandidat untuk kurasi

| Pokok | Temuan dalam salinan | Cakupan dan batas penerapan |
| --- | --- | --- |
| KBLI | 41011, Konstruksi Gedung Hunian | Permen halaman 17. KBLI bukan pengganti pilihan subklasifikasi. |
| BG001 | Konstruksi Gedung Hunian; jenis Pekerjaan Konstruksi, sifat Umum | Permen halaman 17–18. Ruang lingkup memuat pembangunan, pemeliharaan, pembongkaran dan/atau pembangunan kembali; berbeda dari ruang lingkup GT001. |
| GT001 | Konstruksi Gedung Hunian; jenis Pekerjaan Konstruksi Terintegrasi | Permen halaman 17–18. Ruang lingkup berupa rancang bangun; tabel sifat usaha bertanda `-`, bukan otomatis Umum. |
| Pilihan kualifikasi BG001 | Kecil 1, Kecil 2, Kecil 3, Menengah, Besar | Permen halaman 18. Ini daftar pilihan pada tabel, bukan keputusan bahwa satu perusahaan memenuhi salah satunya. Batas per bentuk BUJK tetap harus diperiksa. |
| Pilihan kualifikasi GT001 | Besar | Permen halaman 18; konsisten dengan ketentuan jenis terintegrasi pada Kepdirjen halaman 15. Tidak mewarisi seluruh pilihan BG001. |
| Kesesuaian TKK PJTBU | Untuk BG001/GT001: Arsitektural; Gedung; Manajemen Konstruksi/Manajemen Proyek | Permen halaman 18, angka 3.c. Bukan bukti jumlah personel, jenjang SKK, validitas sertifikat, atau hak rangkap jabatan. |
| Kesesuaian TKK PJKBU | Untuk BG001/GT001: Arsitektural; Gedung | Permen halaman 18, angka 3.d. Pilihan PJTBU tidak boleh disalin sebagai pilihan PJKBU. |
| Dasar perizinan BUJKN mikro/kecil/menengah | Pada baris BG001: risiko Menengah Tinggi; NIB dan Sertifikat Standar; SBU sesuai subklasifikasi; BUJKN bukan usaha orang perseorangan | PP I.H.8. Ini cabang skala/parameter yang terbaca utuh pada halaman 8; baris Besar/asing berlanjut dan tidak disimpulkan dari halaman ini saja. |
| Kewajiban cabang tersebut | Laporan Kegiatan Usaha Tahunan, SBU masih berlaku, dan pelaksanaan ketentuan bidang jasa konstruksi | PP I.H.8. Checklist kandidat tidak menggantikan penelaahan ketentuan yang dirujuk. |
| Waktu pada tabel PP | 15 Hari dalam kolom Jangka Waktu Penerbitan | PP I.H.8. Tidak diubah menjadi janji total layanan SBU atau SLA penjualan aplikasi. |
| Syarat umum KBLI 41011 | SBU BG001 atau GT001 sesuai ruang lingkup | Permen halaman 20, angka 4.a. Hubungan harus membawa jenis usaha/ruang lingkup; tidak memilih kode otomatis hanya dari KBLI. |
| Verifikasi Sertifikat Standar | Nomor SBU di OSS dicocokkan dengan KBLI/data SBU pada SIJK terintegrasi; terdapat jalur manual untuk BUJK PMA/KPBUJKA | Permen halaman 20, angka 5. Deskripsi normatif bukan bukti API tersedia atau integrasi aplikasi telah berfungsi. Prosedur berlanjut pada halaman berikutnya. |

## Konsekuensi untuk penerapan blueprint

1. Pisahkan **skala usaha**, **jenis usaha**, **bentuk BUJK**, **KBLI**,
   **subklasifikasi**, dan **kualifikasi/subkualifikasi SBU**. Jangan konversi
   nilai lama “Kecil” menjadi Kecil 1 tanpa dasar dan pilihan pengguna.
2. Hubungan KBLI–subklasifikasi bukan selalu satu banding satu. Katalog perlu
   menyimpan ruang lingkup dan hubungan dengan jenis usaha, bukan hanya kode.
3. Tabel personel harus membawa peran. Daftar kesesuaian subklasifikasi TKK
   tidak cukup untuk menentukan jumlah, jenjang, atau keabsahan SKK.
4. Daftar alat pada angka 3.e halaman 18 bukan dasar untuk mewajibkan seluruh
   nama alat secara otomatis. Periksa kelanjutan daftar, rujukan A.3, jumlah,
   dan ketentuan penyediaan sebelum menghasilkan checklist peralatan.
5. Kualifikasi jasa konsultansi pada contoh bagian 2.1.5 Kepdirjen halaman 16
   menggunakan K/M/B untuk BUJKN. Jangan menerapkan Kecil 1/2/3 ke semua
   jenis usaha.
6. Setiap kandidat perlu locator, cakupan, versi sumber, status telaah, dan
   bukti publikasi. Pembacaan visual internal tidak otomatis memberi status
   “aturan disetujui”; draf tidak boleh dipakai menghitung skor final.

## Sisa telaah sebelum aturan aktif

- Telaah lanjutan terbatas **BG001 pada BUJKN** tersedia dalam
  [Matriks draf BG001 — BUJKN](bg001-bujkn-requirements-draft.md):
  nilai penjualan/keuangan K1/K2/K3/M/B, jumlah dan jenjang per peran,
  ketentuan minimum/penyediaan alat, locator PDF serta halaman tercetak
  telah dibandingkan visual. Gap tafsir/bukti dan status operasional
  tetap terbuka; hasil ini bukan aturan aktif atau skor final.
- Ambang dan ketentuan seluruh subklasifikasi/bentuk BUJK lain belum
  ditelaah; jangan memperluas temuan BG001 BUJKN ke katalog keseluruhan.
- Kelanjutan baris PP I.H.8 untuk cakupan Besar/asing, serta kelanjutan
  prosedur Permen halaman 20. Matriks di atas tidak mengklaim jalur itu lengkap.
- Hubungan ketentuan peralihan dengan skema yang berlaku untuk suatu kasus.
  Surat pemicu operasional SIJK belum terverifikasi; tanggal keputusan dan
  surat pengantar tidak dipakai sebagai tanggal mulai konversi.
- Sumber pelengkap dan pemeriksaan hukum oleh penelaah berwenang. Identitas
  dokumen unggahan dan kecocokan hash bukan validasi status hukum terkini.

## Mengulang pemeriksaan halaman

Gunakan `python .agents/scripts/review-sbu-source-pages.py PATH_PDF 17 18 20`
untuk memilih nomor halaman PDF secara eksplisit. Script hanya menghasilkan
gambar dan teks sementara di `/tmp/sbu-targeted-review`; tidak menyimpan PDF
asli di SBU dan tidak membuat atau mengaktifkan aturan.
