# Matriks draf BG001 — BUJKN

## Status, cakupan, dan metode

Telaah visual terbatas pada **BG001, KBLI 41011, Pekerjaan Konstruksi
bersifat Umum, BUJKN**, tanggal 10 Oktober 2026. Melanjutkan
[telaah awal](sbu-requirements-review.md), dengan batas
[blueprint](blueprint-adoption.md) dan [dasar regulasi](regulatory-basis.md).
**Bukan aturan aktif, keputusan LSBU, verifikasi hukum terkini, atau skor
kelayakan final.** “Cocok visual” hanya berarti isi dua salinan yang diperiksa
selaras, bukan persetujuan penerapan.

K1/K2/K3 adalah subkualifikasi Kecil; M dan B adalah kualifikasi Menengah
dan Besar. Nilai lama “Kecil” tidak dikonversi otomatis menjadi K1.
GT001, jasa konsultansi, PMA, KPBUJKA, dan subklasifikasi lain tidak menjadi
objek matriks ini. Ketentuan umum BUJK hanya dibawa sejauh relevan untuk
BG001 pada BUJKN. Tidak ada data perusahaan yang dibaca, kasus lama yang
diubah, impor database, aktivasi aturan, pemindahan PDF asli ke storage SBU,
atau koneksi live Gustafta/Ruang Simpan.

Utility `.agents/scripts/review-sbu-source-pages.py` digunakan untuk render
halaman terarah; gambar diperiksa untuk pasangan baris/kolom, nilai, satuan,
dan kelanjutan halaman. Teks native hanya membantu pencarian. Hasil render
sementara ada di `/tmp/sbu-targeted-review`, bukan sitasi publik atau storage
dokumen aplikasi. Hash sumber sudah dicatat di blueprint; kecocokan hash
bukan validasi tanda tangan, keaslian, atau status perubahan/pencabutan.

## Kunci sumber dan locator yang diperiksa visual

- **P**: `attached_assets/permen-pu-6-2025_1791292204964.pdf`.
- **D**: `attached_assets/KEP_DIRJEN_BK_281_STANDAR_SKEMA_SERTIFIKASI_26_AGUSTUS_2026_SU_1791292262823.pdf`,
  termasuk surat pengantar, keputusan, dan lampiran skema.
- Format `P PDF 260/cetak 260` memakai nomor PDF **1-based** dan nomor
  tercetak yang terlihat; offset D tidak boleh diterapkan pada keputusan
  atau surat pengantar. Locator berikut adalah rujukan lokal kurasi.

| Sumber | Halaman PDF | Halaman tercetak | Bagian/baris |
| --- | --- | --- | --- |
| P | 18–19 | 18–19 | Lampiran I A.1, KBLI 41011 angka 3.a–h; baris BG001, kesesuaian TKK, alat K dan M/B |
| P | 259 | 259 | A.3.f.1–5: kualifikasi/subkualifikasi, satu kualifikasi, badan hukum M/B |
| P | 260 | 260 | A.3.h.1.a–f dan h.2.b.1–5: penjualan/pengalaman |
| P | 261–262 | 261–262 | A.3.i.1, i.2.b.1–5, i.3.a–b; j.1.a–f |
| P | 263–264 | 263–264 | A.3.j.2.b.1–11: TKK Pekerjaan Konstruksi, bukan j.2.a konsultansi |
| P | 265–266 | 265–266 | A.3.k.1–15: jumlah, penyediaan dan pencatatan alat; angka 14–15 di 266 |
| D | 18 | 9 | Bagian 2.2.b.(i), Bangunan Gedung, baris 41011/BG001 |
| D | 28 | 19 | Tabel 3.2.1 penjualan dan 3.2.2 keuangan |
| D | 29–30 | 20–21 | Tabel 3.2.3 TKK, K3 berlanjut pada PDF 30; 3.2.4 peralatan |
| D | 38–39 | 29–30 | 5.1.2.1–21 penjualan/pengalaman; 5.1.3.1–4 keuangan |
| D | 39–40 | 30–31 | 5.1.4.1–10: tenaga tetap, SKK, larangan rangkap lintas BUJK |
| D | 40–41 | 31–32 | 5.1.5.1–10: penyediaan dan pencatatan alat; komitmen berlanjut pada PDF 41 |
| D | 66 | 57 | Bagian 21.A: format komitmen penyediaan alat |
| P | 12–13 | 12–13 | Pasal 20 ayat (1)–(3), Pasal 21 ayat (1)–(9) |
| D | 1 | Tidak bernomor | Surat pengantar, butir 1–2 |
| D | 4–5 | 2–3 | Diktum KETIGA–KEENAM |

## 1. Cakupan yang boleh dibawa ke matriks

| Pokok | Hasil pembacaan dan perbandingan | Batas |
| --- | --- | --- |
| Pilihan BUJKN BG001 | P PDF 18/cetak 18 angka 3.a–b: Umum, K1/K2/K3/M/B. D PDF 18/cetak 9 bagian 2.2.b.(i): `K (K1, K2, K3) MB BUJKN`; PMA/KPBUJKA B pada baris terpisah. **Cocok visual untuk BUJKN.** | Tidak menyalin batas PMA/asing ke BUJKN; bukan hak mendapatkan SBU tanpa asesmen. |
| Bentuk dan kualifikasi | P PDF 259/cetak 259 A.3.f.3: satu kualifikasi/subkualifikasi per BUJK; f.5: M/B harus berbadan hukum. | “BUJKN” menunjukkan modal dalam negeri, bukan otomatis perseroan terbatas atau skala usaha tertentu. |
| Penamaan | P: “Konstruksi Gedung Hunian”; D PDF 18/cetak 9: “Konstruksi Konvensional Gedung Hunian”; kode 41011/BG001 cocok. | Perbedaan judul dicatat, tidak dipakai untuk menyimpulkan perubahan ruang lingkup tanpa telaah. |
| Peran dan kesesuaian | P PDF 18/cetak 18 angka 3.c: PJTBU — Arsitektural; Gedung; Manajemen Konstruksi/Manajemen Proyek. Angka 3.d: PJKBU — Arsitektural; Gedung. | Pilihan kesesuaian per peran, bukan kewajiban memiliki seluruh SKK. Jenjang/jumlah harus digabung dengan A.3, bukan disimpulkan dari daftar ini saja. |

## 2. Matriks nilai penjualan dan kemampuan keuangan

Semua angka **rupiah per BUJK**, bukan per proyek atau per unit alat.
Kolom penjualan merekam frasa batas pada sumber, bukan algoritme penentuan
kualifikasi. Tidak menambah batas bawah K1 atau batas atas B yang tidak tertulis.

| Kualifikasi/subkualifikasi | Penjualan tahunan | Kemampuan keuangan paling sedikit | Locator P | Locator D | Hasil |
| --- | --- | --- | --- | --- | --- |
| K1 | Paling banyak Rp2.000.000.000,00 | Rp300.000.000,00 | PDF/cetak 260 h.2.b.1; 261 i.2.b.1 | PDF 28/cetak 19, 3.2.1/3.2.2 baris K1 | Cocok visual |
| K2 | Lebih dari Rp2.000.000.000,00 sampai dengan Rp7.500.000.000,00 | Rp1.000.000.000,00 | PDF/cetak 260 h.2.b.2; 261 i.2.b.2 | PDF 28/cetak 19, 3.2.1/3.2.2 baris K2 | Cocok visual; sumber menggandakan teks `Rp`, bukan menggandakan nilai |
| K3 | Lebih dari Rp7.500.000.000,00 sampai dengan Rp15.000.000.000,00 | Rp2.500.000.000,00 | PDF/cetak 260 h.2.b.3; 261 i.2.b.3 | PDF 28/cetak 19, 3.2.1/3.2.2 baris K3 | Cocok visual |
| M | Lebih dari Rp15.000.000.000,00 sampai dengan Rp50.000.000.000,00 | Rp5.000.000.000,00 | PDF/cetak 260 h.2.b.4; 261 i.2.b.4 | PDF 28/cetak 19, 3.2.1/3.2.2 baris Menengah | Cocok visual |
| B | Lebih dari Rp50.000.000.000,00 | Rp10.000.000.000,00 | PDF/cetak 260 h.2.b.5; 261 i.2.b.5 | PDF 28/cetak 19, 3.2.1/3.2.2 baris Besar | Cocok visual |

**Ketentuan yang menyertai angka:**

- P PDF 261/cetak 261 A.3.i.1.a–c dan D PDF 39/cetak 30 5.1.3:
  modal usaha/ekuitas **tidak termasuk tanah dan bangunan**; bukan omzet,
  saldo bank, atau total aset. Kecil: neraca; M/B: neraca hasil audit KAP
  berizin. Perpanjangan: laporan pajak tahunan terakhir; D 5.1.3.3.c
  menambahkan dokumen/tangkapan layar bukti pembayaran SPT pajak badan
  usaha. Mata uang asing: kurs BI pada tanggal terbit neraca, bukan kurs
  hari ini. Formula rekonsiliasi neraca belum diputuskan dalam draf.
- P PDF 260/cetak 260 A.3.h.1.a–b dan D PDF 38/cetak 29 5.1.2.1–2:
  penjualan yang dinilai berupa akumulasi yang diajukan selama masa berlaku
  SBU, dibuktikan pengalaman sah tercatat di SIJK. D 5.1.2.7–14 memuat
  kontrak, porsi KSO/subpenyedia, kontrak tahun jamak, major item/RAB dan
  segmentasi subklasifikasi; ini bukan pendapatan satu tahun kalender
  yang boleh langsung dipakai tanpa pemeriksaan bukti.
- P PDF 262/cetak 262 **A.3.i.3.a–b** (judul tercetak “Ketentuan lain
  kriteria penjualan tahunan”, meskipun berada di bagian i) dan D PDF
  39/cetak 30 5.1.2.19–20: penjualan melebihi batas atas dapat tetap
  mempertahankan kualifikasi; tidak mencapai batas minimal mendapat
  kualifikasi sesuai penjualan. **Jangan otomatis menaikkan kualifikasi.**
- P PDF 260/cetak 260 h.1.c versus h.1.e, serta D PDF 38/cetak 29
  5.1.2.3–4: pengalaman minimal satu pada dua periode SBU (D menambahkan
  berturut-turut/6 tahun terakhir), tetapi larangan perpanjangan memakai
  rumusan “dalam masa berlakunya SBU”. D PDF 39/cetak 30 5.1.2.21
  merujuk penjelasan lampiran. Hubungan kedua jendela tersebut **belum
  diselesaikan**, bukan alasan mengarang masa pengamatan. Lihat G1–G2.

## 3. Matriks jumlah dan jenjang per peran

Jumlah di bawah adalah **alokasi peran** yang tertulis, bukan selalu jumlah
orang unik. Seluruh PJBU adalah satu orang pimpinan tertinggi; tidak ada
jenjang SKK PJBU tersendiri pada baris yang ditelaah. PJTBU dan PJKBU harus
memiliki SKK sesuai subklasifikasi TKK untuk perannya.

| Kualifikasi/subkualifikasi | PJBU | PJTBU | PJKBU | Locator P | Locator D | Hasil |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | 1 orang | 1 orang, KKNI paling rendah jenjang 4 | 1 orang, KKNI paling rendah jenjang 3 | PDF/cetak 263 A.3.j.2.b.2.a–c | PDF 29/cetak 20, 3.2.3 K1 a–c | Cocok visual |
| K2 | 1 orang | 1 orang, KKNI paling rendah jenjang 5 | 1 orang, KKNI paling rendah jenjang 4 | PDF/cetak 263 A.3.j.2.b.3.a–c | PDF 29/cetak 20, 3.2.3 K2 a–c | Cocok visual |
| K3 | 1 orang | 1 orang, KKNI paling rendah jenjang 6 | 1 orang, KKNI paling rendah jenjang 5 | PDF/cetak 263 A.3.j.2.b.4.a–c | PDF 29/cetak 20, 3.2.3 K3 a–c | Cocok visual |
| M | 1 orang | 1 orang, KKNI paling rendah jenjang 7 atau ahli muda | 1 orang, KKNI paling rendah jenjang 6 | PDF/cetak 263–264 A.3.j.2.b.5.a–c | PDF 30/cetak 21, 3.2.3 Menengah a–c | Cocok visual |
| B | 1 orang | 1 orang, KKNI paling rendah jenjang 8 atau ahli madya | 1 orang, KKNI paling rendah jenjang 7 atau ahli muda | PDF/cetak 264 A.3.j.2.b.6.a–c | PDF 30/cetak 21, 3.2.3 Besar a–b (PJKBU berada dalam b) | Cocok visual |

**Kondisi peran, jangan hilangkan saat membaca matriks:**

1. P PDF 262/cetak 262 A.3.j.1.a–f dan D PDF 39–40/cetak 30–31
   5.1.4.1–7: tenaga tetap; PJBU menunjuk PJTBU/PJKBU; tidak boleh
   merangkap PJBU/PJTBU/PJKBU pada **BUJK lain**; PJKBU dapat lebih dari satu
   orang menyesuaikan syarat tiap klasifikasi; pengunduran diri/berhalangan
   tetap harus disertai penonaktifan dan penggantian melalui SIJK.
2. **K1 saja**: PJBU dapat merangkap PJTBU; PJTBU dapat merangkap PJKBU;
   bila PJTBU juga PJBU, ia tidak boleh sekaligus PJKBU. P PDF 264/cetak
   264 A.3.j.2.b.7–9; D PDF 29/cetak 20 3.2.3 K1 d–f. Tidak ada dasar
   menyatukan tiga peran pada satu orang atau memperluas izin ini ke K2/K3/M/B.
3. Lebih dari satu subklasifikasi: persyaratan jumlah/jenjang PJTBU mengikuti
   **salah satu subklasifikasi yang dimiliki** (P PDF 264/cetak 264
   j.2.b.10; D 3.2.3 K1 g, K2 d, K3 d, M d, B c pada PDF 29–30/cetak
   20–21). Jangan mengimpor rumusan “tertinggi” dari tabel konsultansi.
4. K1/K2/K3: satu PJKBU dapat merangkap lebih dari satu klasifikasi dalam
   **satu BUJK** bila SKK memenuhi setiap klasifikasi. P PDF 264/cetak
   264 j.2.b.11; D PDF 29–30/cetak 20–21 K1 h, K2 e, K3 e (berlanjut).
   Ini berbeda dari rangkap lintas peran dan bukan rangkap lintas perusahaan.

## 4. Matriks minimum dan penyediaan alat

| Cakupan BG001 BUJKN | Minimum tertulis | Jenis alat yang dirujuk | Locator jumlah P / D | Hasil |
| --- | --- | --- | --- | --- |
| K1, K2, K3 (Kecil) | Paling sedikit 1 unit **per subklasifikasi** | P PDF 18/cetak 18 A.1 KBLI 41011 angka 3.e, baris BG001 (K) | P PDF/cetak 265 A.3.k.2.a / D PDF 30/cetak 21 tabel 3.2.4 Kecil | Cocok visual; tabel jumlah tidak memecah K1/K2/K3 |
| M | Paling sedikit 1 unit **per subklasifikasi** | P PDF 19/cetak 19, kelanjutan 3.e, BG001 (M/B) | P PDF/cetak 265 k.2.b / D PDF 30/cetak 21 tabel 3.2.4 Menengah | Cocok visual |
| B | Paling sedikit 2 unit **per subklasifikasi** | P PDF 19/cetak 19, kelanjutan 3.e, BG001 (M/B) | P PDF/cetak 265 k.2.c / D PDF 30/cetak 21 tabel 3.2.4 Besar | Cocok visual |

Daftar jenis pada P 18–19 **tidak disalin sebagai kewajiban menyediakan
semua nama alat**. Contoh untuk penelusuran, bukan rekomendasi pemilihan:
`concrete mixer` muncul pada K maupun M/B; `pick up` ada pada baris K;
`tower crane` ada pada baris M/B. Baris GT001 (B) tidak digunakan.
Jumlah adalah **unit**, bukan jumlah jenis; sumber ini belum cukup untuk
memutuskan cara menghitung scaffolding atau apakah dua unit B harus beda
jenis. Pilihan jenis, spesifikasi, kapasitas dan metode hitung masih G4.

| Ketentuan penyediaan | Perbandingan dan locator | Status/batas |
| --- | --- | --- |
| Bentuk penyediaan | P PDF/cetak 265 k.5–7: milik sendiri, sewa beli dan/atau sewa. D PDF 40/cetak 31 5.1.5.1–2: milik sendiri; sewa beli dengan Perusahaan Pembiayaan; sewa dengan pemilik alat. | Tidak harus membeli semua alat. Detail pihak sewa beli perlu dibedakan, jangan menyamakan semua kontrak. |
| Bukti milik/sewa | P k.6: faktur penjualan, akta jual beli, kuitansi, surat hibah, laporan neraca aset, atau bukti lain sah. P k.7: perjanjian sewa beli/sewa antara BUJK dan pemilik. D 5.1.5.2 menambahkan surat perjanjian sewa beli ke daftar bukti hak milik. | Perbedaan pengelompokan bukti dicatat untuk telaah; dokumen diunggah bukan otomatis bukti sah atau terverifikasi. |
| Pemakaian lintas subklasifikasi | P PDF/cetak 265 k.4; D PDF 41/cetak 32 5.1.5.10: jenis alat sama dapat memenuhi subklasifikasi lain, paling banyak 5 subklasifikasi dalam 1 klasifikasi sama. | Tidak dihitung sebagai izin tanpa batas, lintas klasifikasi, atau antar-BUJK; tafsir batas total/lain perlu G5. |
| Pencatatan alat | P PDF/cetak 265 k.8–11: SIJK, pencatatan untuk M/B; status terdata sementara, terdata tetap, terdata final atau tercatat. D PDF 40/cetak 31 5.1.5.3–6: SIJK melalui SIMPK untuk M/B; Kecil **tidak wajib** mencatat peralatan di SIMPK. | P k.8 yang umum dibaca bersama k.9, bukan kewajiban SIMPK universal. Cocok pada M/B/status; pengecualian Kecil eksplisit pada D, perlu G5 untuk penerapan. |
| Jalur komitmen | P PDF/cetak 265–266 k.12–14; D PDF 40–41/cetak 31–32 5.1.5.7–9: dapat dipenuhi dengan komitmen kesanggupan penyediaan pada setiap pekerjaan selama masa berlaku SBU, tercatat di SIJK, ditandatangani PJBU. | Tidak dibatasi “SBU pertama kali” pada ketentuan alat ini; jangan menyalin batas komitmen SMAP. Bukan bukti alat sudah tersedia atau penghapusan minimum unit. |
| Format komitmen | D PDF 66/cetak 57 bagian 21.A: pilihan Kecil/Menengah/Besar; menyediakan dengan memiliki/sewa/sewa beli **saat pelaksanaan pekerjaan dalam masa berlaku SBU**. | Format mendukung pembacaan waktu pemenuhan; evaluasi kecukupan komitmen vs minimum/jumlah/pencatatan tetap G5. Tidak membuat surat perusahaan atau tenggat baru. |

## 5. Peralihan dan status operasional — tetap tertahan

| Alur | Teks yang diperiksa visual | Kesimpulan draf |
| --- | --- | --- |
| Penyesuaian skema LSBU | D PDF 4/cetak 2 KETIGA–KEEMPAT: acuan skema LSBU dan penyesuaian/implementasi paling lambat 6 bulan sejak penetapan. KELIMA: mencabut 37/KPTS/DK/2025. D PDF 5/cetak 3 KEENAM: mulai berlaku pada tanggal ditetapkan. | Berlaku keputusan, kewajiban LSBU dan kesiapan layanan bukan satu pemicu. Tidak menghitung tanggal atau memastikan status mutakhir dari salinan. |
| Operasional sertifikasi | P PDF/cetak 12 Pasal 20(1)–(2): setelah penyesuaian sarana/prasarana SIJK; dimulai dengan surat pimpinan unit organisasi bidang jasa konstruksi. D PDF 1, tanpa nomor cetak, butir 2 mengulang kedua syarat. | Surat pengantar penyampaian keputusan bukan surat dimulainya penyelenggaraan. Kesiapan SIJK, surat pemicu, cakupan dan status mutakhir **belum terverifikasi**, bukan terbukti belum ada. |
| Permohonan dalam masa transisi | P PDF/cetak 13 Pasal 21(1): bila OSS sudah menerapkan PP 28/2025 tetapi SIJK belum beroperasi, SBU yang diajukan diproses menurut Permen PUPR 8/2022 melalui portal perizinan Kementerian; ayat (5) mengatur perubahan/perpanjangan sesuai Permen ini. | Cabang bersyarat ini perlu telaah per jenis permohonan/kondisi operasional. Tidak otomatis menerapkan matriks baru ke seluruh permohonan atau kasus lama. |
| Konversi SBU eksisting | P PDF/cetak 13 Pasal 21(2)–(6): 6 bulan sejak **terbit surat Pasal 20(2)**, perubahan tanpa asesmen, masa berlaku mengikuti SBU lama, akibat bila tidak konversi. Ayat (7): penggunaan SBU lama dalam pemilihan/pengikatan/pelaksanaan kontrak dengan syaratnya. | Tidak memakai tanggal keputusan, surat pengantar, sosialisasi atau pemeriksaan internal. Pengecualian ayat (7) perlu telaah ahli; tanpa tenggat, hitung mundur, atau migrasi kasus. |

Gerbang dalam regulatory-basis.md tetap berlaku: konfirmasi resmi penerbit
atas keaslian/status Kepdirjen, surat Pasal 20(2) (nomor, tanggal terbit,
penandatangan/kewenangan, cakupan, perubahan/pencabutan), kesiapan SIJK, dan
telaah ahli skema/LSBU yang teridentifikasi **terpisah per alur**.
Pembacaan tabel ini tidak memenuhi gerbang tersebut.

## 6. Daftar gap untuk penelaah

| ID | Gap atau ambiguitas | Locator pemicu | Yang perlu diperiksa sebelum dipakai |
| --- | --- | --- | --- |
| G1 | Jendela pengalaman perpanjangan: dua periode/6 tahun versus “masa berlakunya SBU”; penjelasan lampiran belum ditelaah dalam cakupan ini. | P PDF/cetak 260 h.1.c/e/f; D PDF 38–39/cetak 29–30 5.1.2.3–6/21 | Telusuri lampiran penjelasan dan minta telaah hubungan kedua ketentuan per jenis permohonan. Jangan menolak perpanjangan otomatis. |
| G2 | Unit penjualan per BUJK versus pembuktian/akumulasi per subklasifikasi; major item dan larangan penggunaan ulang pengalaman. | P PDF/cetak 260 h.1–2; D PDF 38/cetak 29 5.1.2.10–13 | Telaah alokasi kontrak BG001, porsi KSO, tahun jamak dan potensi hitung ganda. Tabel angka bukan formula alokasi atau pengecualian otomatis untuk BUJKN baru. |
| G3 | Daftar kesesuaian TKK belum memetakan setiap jenjang K1–B ke jabatan kerja/SKK yang diakui dan validitasnya. | P PDF/cetak 18 angka 3.c–d; 263–264 j.2.b; D PDF 29–30/cetak 20–21 | Periksa acuan jabatan kerja, penerbit/masa berlaku SKK, tenaga tetap serta hak rangkap. Jangan membuat jenjang baru atau menyatakan semua pilihan memiliki semua jenjang. |
| G4 | Pemilihan jenis/spesifikasi alat dan cara menghitung unit, khususnya B dua unit, scaffolding, serta bentuk nama dengan garis miring. | P PDF/cetak 18–19 angka 3.e; 265 k.2; D PDF 30/cetak 21 3.2.4 | Penelaah skema menentukan bukti/unit/jenis yang cukup; tidak menganggap seluruh daftar wajib atau dua jenis selalu wajib. |
| G5 | Jalur komitmen vs jumlah alat, beda pengelompokan bukti sewa beli, pencatatan Kecil/komitmen SIJK, serta batas “subklasifikasi lain paling banyak 5”. | P PDF/cetak 265–266 k.4–14; D PDF 40–41/cetak 31–32 5.1.5; PDF 66/cetak 57 | Minta keputusan telaah tertulis tentang jalur bukti/pencatatan dan saat pemenuhan. SIMPK alat dan SIJK komitmen bukan kewajiban yang identik; jangan memaksa beli atau menghapus jumlah unit. |
| G6 | Rekonsiliasi modal/ekuitas tanpa tanah/bangunan, periode neraca/audit/pajak dan bukti SPT belum menjadi prosedur tervalidasi. | P PDF/cetak 261 i.1; D PDF 39/cetak 30 5.1.3 | Tetapkan cara membaca bukti dan kurs sesuai sumber dengan penelaah keuangan; jangan memakai total aset sebagai ambang ekuitas. Tidak mengambil data perusahaan dalam telaah ini. |
| G7 | Status hukum terkini, pemicu operasional, penerapan transisi dan pengecualian SBU lama belum terverifikasi. | P PDF/cetak 12–13 Pasal 20–21; D PDF 1, 4–5/cetak tanpa nomor, 2–3 | Bukti resmi dan telaah ahli sebagaimana regulatory-basis.md; tidak mengasumsikan terbit/tidak terbit atau mengaktifkan tanggal. |

Angka pada matriks telah terbaca dan dibandingkan, tetapi G1–G7 tetap
terbuka untuk telaah penerapan. Katalog menyeluruh, kelanjutan PP I.H untuk
Besar/asing, dan ketentuan lain (termasuk SMAP/administrasi) tidak dinyatakan
lengkap oleh dokumen ini. Hasil BG001 tidak disebarkan ke seluruh katalog.

## Mengulang pemeriksaan

```sh
python .agents/scripts/review-sbu-source-pages.py attached_assets/permen-pu-6-2025_1791292204964.pdf 18 19 259 260 261 262 263 264 265 266 12 13
python .agents/scripts/review-sbu-source-pages.py attached_assets/KEP_DIRJEN_BK_281_STANDAR_SKEMA_SERTIFIKASI_26_AGUSTUS_2026_SU_1791292262823.pdf 18 28 29 30 38 39 40 41 66 1 4 5
```

Tidak ada perubahan aplikasi sehingga tidak diperlukan restart workflow,
uji browser atau skor simulasi. Pemeriksaan deliverable berupa pencocokan
visual halaman sumber, batas cakupan, locator dan tautan dokumentasi.
