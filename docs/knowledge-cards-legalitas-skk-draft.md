# Kartu pengetahuan Legalitas/OSS dan matriks SKK–SBU

**Status seluruh kartu: DRAF KURASI — tidak aktif untuk retrieval atau penilaian.**

## Batas pemeriksaan

Kartu disusun dari salinan unggahan pengguna, bukan hasil konfirmasi ke
penerbit atau pemeriksaan OSS/SIJK langsung. Kebenaran kutipan pada salinan
dibedakan dari autentikasi, status hukum terkini, dan persetujuan penggunaan
dalam aplikasi. Tidak mengambil data perusahaan atau mengubah kasus lama.

Sumber:

- **PP:** `attached_assets/PP_Nomor_28_Tahun_2025_1793064752315.pdf`
  (PP 28/2025, 383 halaman).
- **P:** `attached_assets/permen-pu-6-2025_1793064858948.pdf`
  (Permen PU 6/2025, 393 halaman).
- **D:** `attached_assets/KEP_DIRJEN_BK_281_STANDAR_SKEMA_SERTIFIKASI_26_AGUSTUS_2026_SU_1793064932746.pdf`
  (Kepdirjen BK 281/KPTS/DK/2026 beserta pengantar, 186 halaman).

Identitas versi dan deduplikasi mengikuti `knowledge-intake-sbu-claw.md`.
Locator PDF selalu 1-based; halaman cetak adalah nomor pada dokumen,
bukan asumsi offset tetap. Pemeriksaan visual baru dilakukan pada PP
78 dan 125; P 18, 263, 264; D 40. Locator lain di bawah diperiksa dari
teks native, dengan batas pemeriksaan tersebut dinyatakan.

## LEG-01 — NIB tidak menyamakan seluruh jenis perizinan

**Sumber/locator:** PP, Pasal 1 angka 12–13, PDF 3/cetak 3;
Pasal 130, PDF 77/cetak 77; Pasal 132 ayat (1), PDF 78/cetak 78.
**Peran:** salinan sumber primer; locator terakhir juga diperiksa visual.

**Kutipan:** “PB untuk kegiatan usaha dengan tingkat Risiko menengah
tinggi ... berupa: a. NIB; dan b. Sertifikat Standar.”

**Bunyi aturan:** PP membedakan bentuk perizinan menurut tingkat risiko.
Pasal 1 mendefinisikan NIB sebagai bukti registrasi/pendaftaran sekaligus
identitas pelaku usaha, dan Sertifikat Standar sebagai pernyataan dan/atau
bukti pemenuhan standar.

**Interpretasi untuk desain:** kolom NIB dan bukti/status Sertifikat Standar
harus terpisah. Terisinya NIB tidak boleh menghasilkan label “seluruh
legalitas lengkap”.

**Cakupan:** penjelasan umum perizinan, bukan penetapan risiko semua KBLI
jasa konstruksi dari satu pasal.

**Pertanyaan telaah:** KBLI, edisi klasifikasi, tingkat risiko, lingkup
kegiatan, dan ketentuan sektor apa yang relevan untuk kasus bersangkutan?

## LEG-02 — Status belum terverifikasi bukan keputusan memenuhi standar

**Sumber/locator:** PP, Pasal 222 ayat (1)–(2), PDF 124/cetak 124;
ayat (3)–(8), PDF 125/cetak 125 (halaman 125 diperiksa visual).

**Kutipan ayat (7):** “... menyampaikan notifikasi ke Sistem OSS berupa
memenuhi persyaratan atau tidak memenuhi persyaratan.”

**Bunyi aturan:** untuk cabang risiko menengah tinggi yang diatur pasal ini,
terdapat tahapan Sertifikat Standar bertanda belum terverifikasi,
pemenuhan standar, dan verifikasi oleh instansi sesuai kewenangannya.

**Interpretasi untuk desain:** pisahkan status yang dinyatakan dalam bukti
OSS dari status “ditelaah internal”. Unggahan tangkapan layar tidak
mengubah status resmi atau membuktikan autentisitas.

**Data kandidat:** referensi dokumen, tanggal bukti, status sebagaimana
tertulis, pencatat, dan catatan perbedaan. Jangan menyimpan kredensial OSS.

**Pertanyaan telaah:** bukti apa yang cukup untuk pencatatan status;
bagaimana konteks lingkungan/NSPK dan kewenangan pada kegiatan spesifik?
Jangan menggeneralisasi kewajiban UKL-UPL/SPPL dari potongan pasal saja.

## LEG-03 — KBLI dan subklasifikasi SBU adalah entitas berbeda

**Sumber/locator:** P, Lampiran I A.1, KBLI 41011, angka 1,
PDF 17/cetak 17; angka 3.a–d, PDF 18/cetak 18.
Halaman 18 diperiksa visual; halaman 17 dari teks native.

**Kutipan singkat:** “KBLI: 41011 (KONSTRUKSI GEDUNG HUNIAN)”;
“Subklasifikasi jasa konstruksi: a. BG001 ... b. GT001 ...”.

**Bunyi aturan:** halaman ini memuat KBLI dan subklasifikasi jasa
konstruksi pada bagian berbeda, beserta jenis usahanya.

**Interpretasi untuk desain:** simpan kode KBLI, edisi KBLI, kode SBU,
jenis usaha, dan locator hubungan secara terpisah.

**Cakupan:** contoh terarah BG001/GT001; bukan tabel hubungan seluruh
KBLI atau bukti bahwa kode yang sama selalu bermakna sama antar-edisi.
Edisi KBLI pada pemetaan ini belum ditetapkan dari potongan halaman saja.

**Pertanyaan telaah:** apa bukti edisi KBLI sumber dan tabel konversi
yang berlaku? Jangan mengisi edisi otomatis berdasarkan tahun peraturan.

## SKK-01 — Nama peran harus mengikuti sumber

**Sumber/locator:** D, 5.1.4 angka 1–2, PDF 39/cetak 30;
angka 3–7 dan 10, PDF 40/cetak 31. Halaman 40 diperiksa visual.

**Kutipan angka 1:** “Penanggung Jawab Badan Usaha (PJBU)”;
“Penanggung Jawab Teknik Badan Usaha (PJTBU)”;
“Penanggung Jawab Klasifikasi Badan Usaha (PJKBU)”.

**Bunyi aturan:** angka 2 menyebut PJBU menunjuk PJTBU dan PJKBU
sebagai tenaga tetap. Angka 3 mengaitkan PJTBU/PJKBU dengan SKK sesuai
subklasifikasi yang diajukan berdasarkan klasifikasi.

**Interpretasi untuk desain:** petakan kebutuhan pengguna tentang
penanggung jawab klasifikasi/kualifikasi ke nama peran resmi dengan
penjelasan, bukan menciptakan jabatan resmi baru “penanggung jawab
kualifikasi/subkualifikasi” tanpa locator. Jangan mewajibkan SKK untuk
PJBU hanya karena PJTBU/PJKBU memerlukannya.

**Pertanyaan telaah:** apakah ada ketentuan lain yang secara eksplisit
menggunakan jabatan yang dimaksud pengguna? Bagaimana peran lama dan baru
ditampilkan tanpa memigrasikan penugasan kasus lama secara otomatis?

## SKK-02 — Kesesuaian bidang TKK untuk BG001

**Sumber/locator:** P, Lampiran I A.1 KBLI 41011 angka 3.c–d,
PDF 18/cetak 18, diperiksa visual.

**Kutipan tabel BG001:**
- PJTBU: “Arsitektural”; “Gedung”;
  “Manajemen Konstruksi/Manajemen Proyek”.
- PJKBU: “Arsitektural”; “Gedung”.

**Interpretasi untuk desain:** kesesuaian bidang berbeda per peran.
Daftar tersebut bukan kewajiban satu orang memiliki semua sertifikat.
Kesesuaian bidang harus digabung dengan jumlah/jenjang dan ketentuan
penugasan, bukan dinilai dari judul sertifikat saja.

**Cakupan:** kartu ini hanya BG001 BUJKN pekerjaan konstruksi. Tabel juga
memuat GT001, tetapi kebutuhan terintegrasi tidak diturunkan dari matriks
jenjang pekerjaan konstruksi di kartu berikut.

**Pertanyaan telaah:** tabel jabatan kerja SKK resmi dan versi apa yang
memetakan setiap jabatan ke subklasifikasi TKK tersebut? Nama bebas
sertifikat belum cukup untuk pencocokan otomatis.

## SKK-03 — Jumlah dan jenjang pekerjaan konstruksi

**Sumber/locator:** P, Lampiran I A.3.j.2.b angka 1–6,
PDF 263–264/cetak 263–264, diperiksa visual.

**Kutipan K1:** “1 (satu) orang PJTBU dengan SKK kualifikasi KKNI paling
rendah jenjang 4 (empat) sesuai dengan subklasifikasi TKK”.

**Transkripsi ringkas, bukan aturan aktif:**

| Kualifikasi/subkualifikasi | PJBU | PJTBU minimum | PJKBU minimum | PDF/cetak |
| --- | --- | --- | --- | --- |
| K1 | 1 orang | 1 orang, jenjang 4 | 1 orang, jenjang 3 | 263 |
| K2 | 1 orang | 1 orang, jenjang 5 | 1 orang, jenjang 4* | 263 |
| K3 | 1 orang | 1 orang, jenjang 6 | 1 orang, jenjang 5 | 263 |
| M | 1 orang | 1 orang, jenjang 7 atau ahli muda | 1 orang, jenjang 6 | 263–264 |
| B | 1 orang | 1 orang, jenjang 8 atau ahli madya | 1 orang, jenjang 7 atau ahli muda | 264 |

Semua kebutuhan SKK di tabel tetap mensyaratkan kesesuaian subklasifikasi
TKK. Jumlah peran tidak otomatis sama dengan jumlah orang unik karena
ketentuan rangkap memiliki cakupan khusus.

**Konflik yang harus dipertahankan:** *baris K2 PJKBU secara literal
menulis “SKK kualifikasi KKNI jabatan ahli paling rendah jenjang 4”.
Jangan menghilangkan frasa “jabatan ahli” atau menormalisasinya menjadi
kategori keahlian terverifikasi. Minta klarifikasi jika dipakai menentukan
kesesuaian kategori sertifikat.*

**Cakupan:** pekerjaan konstruksi; tidak otomatis untuk konsultansi,
terintegrasi, KPBUJKA, PMA, atau seluruh skema institusional.

**Pertanyaan telaah:** apakah ada ralat/penjelasan resmi frasa K2?
Bagaimana matriks ini dipasangkan dengan skema, bidang SKK, serta kondisi
operasional/transisi yang benar untuk permohonan Baru/Perpanjangan?

## SKK-04 — Rangkap di dalam BUJK berbeda dari rangkap lintas BUJK

**Sumber/locator:** P, A.3.j.2.b angka 7–11, PDF 264/cetak 264;
D, 5.1.4 angka 4–7, PDF 40/cetak 31. Keduanya diperiksa visual.

**Kutipan D angka 4:** “Tenaga kerja tidak boleh merangkap jabatan PJBU,
PJTBU, atau PJKBU pada BUJK lain.”

**Bunyi aturan:** P angka 7–9 mengatur rangkap PJBU/PJTBU/PJKBU untuk
K1, termasuk larangan merangkap ketiganya pada kondisi yang disebut.
Angka 11 memungkinkan satu PJKBU pada K1/K2/K3 merangkap lebih dari satu
klasifikasi atas satu BUJK selama SKK memenuhi setiap klasifikasi.
Angka 10 mengatur jumlah/jenjang PJTBU ketika subklasifikasi lebih dari satu.

**Interpretasi untuk desain:** penugasan harus dipetakan per orang,
BUJK, peran, klasifikasi, dan bukti SKK. Jangan menyimpulkan semua
rangkap terlarang atau semua rangkap diperbolehkan.

**Batas:** aplikasi mandiri tidak dapat membuktikan ketiadaan penugasan
di perusahaan lain dari data akun sendiri. Deklarasi bukan verifikasi
nasional; jangan membaca data akun lain untuk mencoba membuktikannya.

**Pertanyaan telaah:** dokumen/bukti sah apa yang diperlukan, dan bagaimana
menampilkan potensi konflik tanpa otomatis menyatakan pelanggaran?

## Gerbang sebelum penggunaan operasional

P, Pasal 20 ayat (1)–(2), PDF/cetak 12, dan Pasal 21 ayat (1)–(7),
PDF/cetak 13, dibaca dari teks native sebagai pengingat batas transisi.
Surat pemicu dan keadaan operasional terkini belum diverifikasi langsung.
Jangan memulai hitungan konversi dari tanggal unggahan, sosialisasi, atau
tanggal keputusan semata.

Sebelum aktivasi, setiap kartu memerlukan telaah substansi, cakupan
Baru/Perpanjangan dan badan usaha, pemeriksaan versi/status sumber, serta
persetujuan retrieval yang terpisah dari autentikasi dan aktivasi aturan.
Kartu ini tidak mengisi atau mengubah penilaian otomatis.

## Bukti penyelesaian tahap ini

- Tujuh kartu berlocator, kutipan, interpretasi, cakupan, dan pertanyaan telaah.
- Teks serta gambar halaman sasaran dibandingkan untuk tabel utama.
- Tidak menjalankan AI, query data perusahaan, integrasi live, migrasi,
  pengujian aplikasi, atau publikasi.
- Tidak mengubah prompt/katalog runtime, kasus lama, atau persyaratan aktif.
