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
  merujuk penjelasan lampiran. Lampiran kini diperiksa visual pada D PDF
  83–85/cetak 74–76; contoh BG001 membatasi pembacaan “masa berlakunya
  SBU” sebagai satu periode terakhir saja. Hubungan operasional kedua
  jendela tersebut **belum disahkan untuk penerapan**, bukan alasan
  mengarang masa pengamatan atau menolak otomatis. Lihat adendum
  bagian 7 untuk G1–G2.

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
| G1 | Jendela pengalaman perpanjangan: dua periode/6 tahun versus “masa berlakunya SBU”; lampiran sudah ditelaah visual, penerapan belum disahkan. | P PDF/cetak 260 h.1.c/e/f; D PDF 38–39/cetak 29–30 5.1.2.3–6/21; D PDF 83–85/cetak 74–76 bagian I | Adendum 7.1–7.2 mencatat diagram BG001 dan pertanyaan per jenis permohonan. Jangan menolak perpanjangan otomatis atau menganggap dua periode sebagai masa berlaku satu SBU. |
| G2 | Unit penjualan per BUJK versus pembuktian/akumulasi per subklasifikasi; major item dan larangan penggunaan ulang pengalaman. | P PDF/cetak 260 h.1–2; D PDF 38/cetak 29 5.1.2.7–14; D PDF 95/cetak 86 butir 1–4 | Adendum 7.3–7.4 dan [catatan telaah G2](bg001-contract-allocation-review-draft.md) memuat pembanding LSBU beridentitas, rekonsiliasi bersyarat dan keputusan U/R/A yang masih terbuka. Belum ada jawaban ahli memadai; tabel angka bukan formula alokasi atau pengecualian otomatis BUJKN baru. |
| G3 | Daftar kesesuaian TKK belum memetakan setiap jenjang K1–B ke jabatan kerja/SKK yang diakui dan validitasnya. | P PDF/cetak 18 angka 3.c–d; 263–264 j.2.b; D PDF 29–30/cetak 20–21 | Periksa acuan jabatan kerja, penerbit/masa berlaku SKK, tenaga tetap serta hak rangkap. Jangan membuat jenjang baru atau menyatakan semua pilihan memiliki semua jenjang. |
| G4 | Pemilihan jenis/spesifikasi alat dan cara menghitung unit, khususnya B dua unit, scaffolding, serta bentuk nama dengan garis miring. | P PDF/cetak 18–19 angka 3.e; 265 k.2; D PDF 30/cetak 21 3.2.4 | Lihat adendum 8.1–8.2: daftar jenis bukan daftar belanja; sumber pelengkap SIMPK memberi satuan *kapasitas*, belum definisi satu unit SBU. Dua unit B tidak otomatis dua jenis, tetapi pengulangan jenis belum disahkan. |
| G5 | Jalur komitmen vs jumlah alat, beda pengelompokan bukti sewa beli, pencatatan Kecil/komitmen SIJK, serta batas “subklasifikasi lain paling banyak 5”. | P PDF/cetak 265–266 k.4–14; D PDF 40–41/cetak 31–32 5.1.5; PDF 66/cetak 57 | Lihat adendum 8.3–8.4: minta keputusan telaah tertulis tentang jalur bukti/pencatatan dan saat pemenuhan. SIMPK alat dan SIJK komitmen bukan kewajiban yang identik; jangan memaksa beli atau menghapus jumlah unit. |
| G6 | Rekonsiliasi modal/ekuitas tanpa tanah/bangunan, periode neraca/audit/pajak dan bukti SPT belum menjadi prosedur tervalidasi. | P PDF/cetak 261 i.1; D PDF 39/cetak 30 5.1.3 | Tetapkan cara membaca bukti dan kurs sesuai sumber dengan penelaah keuangan; jangan memakai total aset sebagai ambang ekuitas. Tidak mengambil data perusahaan dalam telaah ini. |
| G7 | Status hukum terkini, pemicu operasional, penerapan transisi dan pengecualian SBU lama belum terverifikasi. | P PDF/cetak 12–13 Pasal 20–21; D PDF 1, 4–5/cetak tanpa nomor, 2–3 | Bukti resmi dan telaah ahli sebagaimana regulatory-basis.md; tidak mengasumsikan terbit/tidak terbit atau mengaktifkan tanggal. |

Angka pada matriks telah terbaca dan dibandingkan, tetapi G1–G7 tetap
terbuka untuk telaah penerapan. Katalog menyeluruh, kelanjutan PP I.H untuk
Besar/asing, dan ketentuan lain (termasuk SMAP/administrasi) tidak dinyatakan
lengkap oleh dokumen ini. Hasil BG001 tidak disebarkan ke seluruh katalog.

## 7. Adendum G1–G2 — periode dan alokasi pengalaman BG001 BUJKN

Adendum telaah visual tanggal **19 Oktober 2026**, hanya untuk BG001 BUJKN.
Pemeriksaan visual lanjutan atas salinan lokal dicatat pada **20 Oktober 2026**.
Pendalaman G1 pada **22 Oktober 2026** mencocokkan ulang P PDF/cetak 260,
D PDF 38–39/cetak 29–30 dan simulasi D PDF 83–85/cetak 74–76 dengan
bahan skema lembaga beridentitas pada 7.1.1; **telaah ahli khusus G1
yang tervalidasi belum tersedia**.
Kunci P/D dan batas kepercayaan sumber di atas tetap berlaku. Ini **draf
berlocator untuk penelaah**, bukan penetapan hukum terkini, aturan aktif,
keputusan persetujuan/penolakan, atau pengganti asesmen LSBU. G1–G2
diperdalam, **bukan ditutup untuk penerapan**. Tidak ada data perusahaan
yang diambil, kasus lama yang diubah, atau integrasi live yang diaktifkan.

### 7.1. Rantai locator dan hasil pemeriksaan visual

Nomor PDF berikut 1-based; nomor cetak dibaca pada gambar, bukan diasumsikan
dari offset. Diagram dan penjelasan dibaca bersama, termasuk tanda centang,
silang, label `ada`/`n/a`, dan urutan perpanjangan yang hilang dari teks native.

| Locator | Isi sumber yang terlihat | Implikasi terbatas untuk draf BG001 |
| --- | --- | --- |
| P PDF/cetak 260, A.3.h.1.a–c/e–f | Akumulasi penjualan selama masa berlaku SBU, pengalaman sah tercatat di SIJK; minimal satu pengalaman sesuai subklasifikasi dalam dua periode; rumusan tidak dapat diperpanjang bila tidak mendapat pengalaman “dalam masa berlakunya SBU”; pengajuan kembali setelah tiga tahun sejak habis masa berlaku. | Pertentangan pembacaan satu periode versus dua periode sudah ada pada P. P h.1.c tidak menulis tambahan “berturut-turut atau dalam 6 tahun terakhir” seperti D. Huruf d mengenai KPBUJKA tidak dibawa ke BG001 BUJKN. |
| D PDF 38/cetak 29, 5.1.2.1–6; PDF 39/cetak 30, 5.1.2.21 | Angka 3 menyebut dua periode berturut-turut **atau** enam tahun terakhir; angka 4 memakai “masa berlakunya SBU”; angka 5–6 mengatur jeda tiga tahun dan jalur permohonan baru. Angka 21 merujuk penjelasan sebagaimana lampiran. | Lampiran yang relevan ditemukan pada bagian **I. SIMULASI PERPANJANGAN SBU**, PDF 83–85/cetak 74–76, sesudah format H dan sebelum bagian 22. Angka 21 tidak menyebut nomor halaman; hubungan ini berdasarkan judul dan isi, bukan nomor lampiran yang dikarang. |
| D PDF 83/cetak 74, bagian I, Simulasi 1, diagram dan penjelasan “Perpanjangan Pertama Kali” serta “Perpanjangan Kedua” | BG001 `ada` pada periode 1 (3 tahun), `n/a` pada periode 2 (3 tahun), tetap centang pada perpanjangan kedua. Penjelasan kedua butir 2 secara eksplisit menyatakan BG001 mendapat pengalaman periode pertama, tidak pada periode kedua, tetap dapat disetujui. Diagram kemudian menunjukkan BG001 `n/a` periode 3 dan silang pada perpanjangan ketiga. | Bukti visual langsung BG001 menentang pembacaan “periode terakhir kosong = langsung gagal”. Urutan juga menunjukkan pengalaman periode 1 bukan bekal tanpa batas untuk semua perpanjangan berikutnya. Tahun contoh 2027/2030/2033 bukan tanggal operasional atau tenggat aplikasi. |
| D PDF 84/cetak 75, Simulasi 4, bagian bawah | BG001 `ada` pada periode 1 (2023–2026) dan periode 2 (2026–2029), `n/a` pada periode 3 (2029–2032), tetap centang tahun 2032. Diagram menandai “Konversi+Perpanjangan (2026)”. | Menguatkan pembacaan dua periode pada contoh BG001 yang melintasi konversi; tidak membuktikan semua konversi mengulang atau menghapus riwayat pengalaman. |
| D PDF 85/cetak 76, Simulasi 5, bagian atas | BG001 `ada` pada periode 1, 2, 3; `n/a` periode 4; tetap centang pada perpanjangan 2032. | Konsisten dengan BG001 masih memiliki pengalaman pada periode sebelumnya. Tidak memberi batas tanggal kontrak/BA atau metode hitung enam tahun sampai tingkat hari. |
| D PDF 95/cetak 86, lanjutan formulir cek/verifikasi/validasi, butir 1–4 | Nilai proyek = nilai kontrak terakhir dikalikan porsi major item sesuai subklasifikasi; pernyataan belum pernah digunakan untuk subklasifikasi lain; K1/K2/K3/M/B sesuai lingkup SBU; dua periode ditulis “6 tahun berturut-turut”. | Formulir menguatkan perlunya porsi, jejak penggunaan, dan periode; tidak menyelesaikan sendiri beda rumusan “atau” pada 5.1.2.3 maupun hubungan angka 10 dan 12. |

Simulasi 1 juga menggambarkan subklasifikasi lain dan penambahan BG004;
Simulasi 2/6 memakai BS, sedangkan Simulasi 3 membahas GT001/konversi.
Halaman-halaman tersebut dilihat untuk konteks urutan lampiran, **bukan**
dasar memperluas matriks, membebaskan BG001 baru dari penilaian, atau
memindahkan pengalaman subklasifikasi lain ke BG001. Kalimat Simulasi 1
tentang seluruh subklasifikasi tanpa pengalaman tetap dicatat sebagai
kondisi pada contoh, bukan keputusan otomatis bagi perusahaan tertentu.
Label `n/a` ditranskripsikan sebagai label diagram; maknanya dibaca bersama
penjelasan, bukan dianggap otomatis data hilang pada aplikasi.

Simulasi 1 Perpanjangan Pertama butir 2–3 menggambarkan pengalaman hanya
BG001, sedangkan BG002/BG003 tetap dapat diperpanjang; butir 5 menggambarkan
seluruhnya tanpa pengalaman dan tidak dapat disetujui. Ini membedakan
konteks perusahaan dan subklasifikasi pada contoh, bukan bukti kebalikan
bahwa BG001 tanpa pengalaman pasti boleh diperpanjang. Contoh BG001 tanpa
pengalaman tetapi subklasifikasi lain berpengalaman belum diputuskan
oleh telaah ini.

#### 7.1.1. Bahan ahli/lembaga yang teridentifikasi dan batas atribusi

**L** adalah salinan
`attached_assets/1._Format_Standar_Skema_Sertifikasi_BG_1792455848045.pdf`,
skema Bangunan Gedung LSBU Konstruksi Indonesia, `SSBG.1.LSBU-KI`,
edisi/revisi **01/11**, tanggal review tertulis **21.09.2026**. L sudah
dibandingkan pada [catatan skema lembaga](bg001-institutional-scheme-comparison-draft.md);
untuk G1, L PDF 2, 37–38 dan 87 diperiksa ulang secara visual.
Ini bahan yang tersedia tanpa menghubungi penelaah atau instansi.

| Locator L (PDF / cetak) | Identitas atau pendapat yang benar-benar tercantum | Bobot untuk G1 |
| --- | --- | --- |
| 2 / header 1 dari 192, tabel pengesahan | Disiapkan oleh **Agus Surya Wijaya, S.Kom**, Kepala Urusan Standarisasi; diperiksa oleh **Agustinus Dikariawan P, SH**, Koordinator Sertifikasi; disetujui oleh **Erwanto Tandrigau, SE**, Ketua Pelaksana. Kolom tanda tangan terlihat. | Nama/peran adalah atribusi pada salinan, bukan hasil verifikasi kompetensi, keaslian tanda tangan, kewenangan terkini, atau bukti ketiganya telah menelaah pertanyaan G1 ini. Tanggal review header bukan tanggal konsultasi dengan mereka. |
| 37–38 / 23–24, 5.1.2.1–6/9/13/21 | Mengulang dua periode berturut-turut **atau** enam tahun terakhir, rumusan “masa berlakunya SBU”, tiga tahun sejak habis berlaku dan jalur baru; memisahkan ketentuan nilai/progres; merujuk lampiran. | Pembanding kelembagaan dengan penanggung jawab tertulis, tetapi pengulangan rumusan D **tidak menyelesaikan** tanggal acuan, jeda, atau rekonsiliasi nilai. Tidak diatribusikan sebagai jawaban pribadi salah satu nama di atas. |
| 87 / 73, Simulasi 1, diagram; penjelasan Perpanjangan Pertama Kali butir 1–6 dan Perpanjangan Kedua butir 1–2 | Contoh BG001 sama dengan D PDF 83/cetak 74: pengalaman periode 1, kosong periode 2, perpanjangan kedua dapat disetujui; periode 3 kosong, diagram perpanjangan ketiga silang. | Keselarasan salinan skema lembaga dan D, **bukan dua pendapat ahli independen** atau persetujuan penerapan pada seluruh kasus BG001. |

**Penelusuran publik terbatas, 22 Oktober 2026:** pencarian memakai frasa
`LSBU pengalaman dua periode perpanjangan pertama kedua`,
`SSBG.1.LSBU-KI 11`, nama pemeriksa, serta
`site:lsbukonstruksi.co.id "dua" "periode"`.
[Beranda LSBU Konstruksi Indonesia](https://www.lsbukonstruksi.co.id/)
dibuka; bagian pengumuman masih menyebut SK 37/KPTS/DK/2025 dan
FAQ “Apakah yang dimaksud dengan Re-Sertifikasi?” hanya memberi definisi
umum. Bagian tersebut tidak memberikan jawaban khusus G1 ataupun
konfirmasi revisi L. Hasil pencarian juga menampilkan
[salinan SSBG.2.LSBU-KI](https://lsbukonstruksi.co.id/assets/skemasertifikasi/2SKEMASSBG.pdf)
dengan cuplikan revisi **01/07**, review **21.11.2024**, serta
[materi penyesuaian skema 2022](https://lsbukonstruksi.co.id/assets/pengumuman/Lk_PenyesuaianSkemaSertifikasiBUJK.pdf).
Keduanya **hanya temuan indeks, tidak ditelaah sebagai naskah lengkap**
di sini; tidak dijadikan dasar G1. Rumusan sembilan tahun yang muncul pada
hasil sumber lama tidak boleh dipindahkan ke jendela minimal dua periode
P/D. Hasil pencarian, metadata tanggal indeks, dan beranda bukan bukti
versi terbaru, status hukum, atau penerapan skema 2026.

**Status ahli: belum terselesaikan.** Bahan lembaga beridentitas tersedia,
tetapi belum ditemukan dalam pemeriksaan terbatas ini pendapat tertulis
tervalidasi ahli skema/LSBU yang menjawab G1 beserta dasar dan batasnya.
Ini bukan bukti bahwa pendapat atau klarifikasi tersebut tidak ada.
Tidak ada komunikasi, konsultasi yang diklaim telah terjadi, pengiriman
pertanyaan, akun lembaga, atau integrasi instansi yang dibangun.

### 7.2. G1 — pisahkan jendela pengalaman dari masa berlaku dan nilai penjualan

**Pembacaan sementara, belum disahkan:** pengalaman minimal untuk
perpanjangan BG001 perlu ditelaah terhadap dua periode berturut-turut,
bukan hanya periode terakhir. Diagram Simulasi 1 memperlihatkan dua
periode masing-masing tiga tahun; **enam tahun adalah jendela pengamatan
dalam rumusan D, bukan masa berlaku enam tahun untuk satu SBU**. Jangan
menyamakan dua periode aktual dengan hitungan mundur enam tahun tanpa
memeriksa riwayat SBU, jeda, perubahan dan konversi.

Pisahkan pula tiga pertanyaan: (a) ada pengalaman BG001 yang memenuhi
jendela minimal; (b) berapa nilai penjualan sah yang boleh diakumulasi
untuk penentuan kualifikasi; (c) apakah permohonan dapat diperpanjang.
P h.1.a dan D 5.1.2.1 tentang nilai selama masa berlaku tidak otomatis
memperluas semua nominal menjadi akumulasi enam tahun. Satu pengalaman
yang relevan pada periode sebelumnya tidak otomatis berarti seluruh
nilai kontraknya boleh dihitung lagi pada periode berjalan.

#### 7.2.1. Urutan perpanjangan — contoh sumber, bukan keputusan kasus

`P1`, `P2`, dan seterusnya di bawah berarti periode **dalam diagram yang
dirujuk**, bukan penetapan tanggal aktual atau nomor periode perusahaan.
Semua hasil centang/silang adalah isi contoh sumber, bukan hasil asesmen
draf ini.

| Tahap | Pencocokan dengan sumber | Batas kesimpulan |
| --- | --- | --- |
| Pertama, sesudah P1 | D PDF 83/cetak 74 Simulasi 1: BG001 `ada` pada P1; diagram centang pada perpanjangan pertama. Penjelasan pertama butir 2–3 menyebut BG001 berpengalaman sementara BG002/BG003 tidak, tetapi keduanya tetap dapat diperpanjang dengan memperhatikan ketentuan pengalaman. Butir 5 menolak contoh ketika semuanya tidak berpengalaman. L PDF 87/cetak 73 mengulangnya. | P PDF/cetak 260 h.1.c/e dan D PDF 38/cetak 29 5.1.2.3–4 tidak boleh dibaca sebagai hak menunggu enam tahun sejak SBU baru. Contoh tidak memutuskan BG001 tunggal tanpa pengalaman, atau BG001 kosong sementara hanya subklasifikasi lain berpengalaman. **Belum terselesaikan untuk penerapan.** |
| Kedua, sesudah P2 | D PDF 83/cetak 74 Simulasi 1, Perpanjangan Kedua butir 2: BG001 berpengalaman di P1, tidak di P2, tetap dapat disetujui; diagram centang. Ini pembacaan langsung, bukan dugaan dari label `n/a` saja. L PDF 87/cetak 73 sama. | Contoh menentang penolakan hanya karena P2 kosong. Belum menentukan hari awal/akhir jendela, tanggal pengalaman, atau nilai P1 yang boleh dihitung untuk kualifikasi pada perpanjangan kedua. |
| Ketiga dan berikutnya | D PDF 83/cetak 74 Simulasi 1: BG001 P2 dan P3 `n/a`, perpanjangan ketiga silang. D PDF 84/cetak 75 Simulasi 4: BG001 P2 `ada`, P3 `n/a`, perpanjangan 2032 centang. D PDF 85/cetak 76 Simulasi 5: BG001 P3 `ada`, P4 `n/a`, perpanjangan 2032 centang; BG002/BG003 yang dua periode terakhir kosong silang. | Contoh konsisten dengan pemeriksaan dua periode berurutan yang relevan, bukan pengalaman sejak pendirian selamanya. **Belum mengesahkan algoritme jendela bergeser** untuk seluruh perpanjangan, terlebih bila periodenya tidak penuh, terputus, atau berubah. |

#### 7.2.2. Tanggal, jeda, konversi dan nilai — register keputusan tertahan

| Isu | Bukti berlocator yang tersedia | Yang belum terselesaikan / tindakan yang ditahan |
| --- | --- | --- |
| Tanggal acuan dan batas hari | D PDF 38/cetak 29 5.1.2.3 menulis “dua periode ... secara berturut-turut atau dalam 6 ... tahun terakhir”; P PDF/cetak 260 h.1.c hanya dua periode. Simulasi D PDF 83–85/cetak 74–76 memakai tahun dan blok tiga tahun. | Tidak menetapkan apakah acuan ialah tanggal permohonan, habis berlaku, atau keputusan; inklusi hari batas dan pengalaman tepat di batas belum jelas. Tidak memilih tanggal hari ini atau mengurangi enam tahun secara otomatis. “Atau” tetap dicatat, bukan diubah menjadi “dan” atau diputuskan setara pada semua riwayat. |
| Peristiwa pengalaman dan lintas periode | P PDF/cetak 260 h.1.a–b: pengalaman sah tercatat SIJK. D PDF 38/cetak 29 5.1.2.7/9: kontrak sah; tahun jamak memakai BA progres dan nilai sesuai pentahapan. | Belum ada penetapan tunggal bahwa tanggal kontrak, BA, serah terima, atau pencatatan SIJK menentukan masuknya pengalaman ke jendela minimal. Keberadaan BA untuk penilaian nilai tidak otomatis memilih tanggal BA sebagai tanggal pengalaman. |
| Jeda riwayat, keterlambatan dan perubahan | D 5.1.2.3 menyebut berturut-turut; Simulasi 1/4/5 hanya menunjukkan periode tiga tahun berurutan. | Tidak ada jawaban terverifikasi tentang periode terputus, permohonan terlambat, perubahan kualifikasi atau masa pendek. Jangan menyambung dua SBU tak berurutan, memulai hitungan baru, atau menganggap enam tahun selalu menggantikan riwayat dua periode. |
| Konversi saja vs konversi bersamaan perpanjangan | P PDF/cetak 13 Pasal 21(3)–(4): konversi melalui perubahan tanpa asesmen, masa berlaku mengikuti SBU sebelum konversi. D PDF 84/cetak 75 Simulasi 4 dan PDF 85/cetak 76 Simulasi 5 menulis **Konversi+Perpanjangan (2026)**; BG001 dengan pengalaman periode sebelum/sekitar konversi tetap muncul dalam urutan contoh. Simulasi 3 pada PDF 84/cetak 75 membahas gabungan usaha terintegrasi/GT001, bukan kalender universal BG001. | Konversi saja tidak membenarkan asumsi otomatis mendapat tiga tahun baru atau riwayat menjadi nol. Cara menomori periode dan mengakui bukti sebelum konversi pada semua kasus **belum disahkan**; contoh gabungan tidak menjawab konversi di tengah masa berlaku. Gerbang operasional bagian 5 tetap terpisah. |
| Jeda tiga tahun sesudah tidak dapat diperpanjang | P PDF/cetak 260 h.1.f; D PDF 38/cetak 29 5.1.2.5–6: sejak **masa berlaku habis**, kemudian ketentuan permohonan baru. D PDF 85/cetak 76 Simulasi 6 memakai BS001–BS003: tidak diperpanjang 2029, diajukan baru 2032. | Titik rujukan tekstual bukan tanggal keputusan penolakan, konversi atau pemeriksaan internal. Simulasi BS hanya konteks mekanisme, bukan asesmen BG001. Belum menghitung tanggal paling awal, memberi larangan otomatis, atau menganggap semua BUJK terlarang mengajukan subklasifikasi lain. |
| Uji minimal pengalaman vs periode nilai penjualan | P PDF/cetak 260 h.1.a/c/e; D PDF 38/cetak 29 5.1.2.1–4/9/13 dan PDF 39/cetak 30 5.1.2.19–21. D PDF 83/cetak 74 membolehkan contoh perpanjangan kedua BG001 dengan pengalaman hanya P1; diagram tidak memberikan nominal atau kalkulasi kualifikasi. | **Uji keberadaan** sedikitnya satu pengalaman tidak sama dengan **uji nilai** penjualan sah. Syarat minimal terpenuhi menurut contoh tidak membuktikan ambang kualifikasi terpenuhi, seluruh nominal P1 boleh dibawa ke P2, atau periode nilai menjadi enam tahun. Periode nilai yang boleh diajukan pada situasi tersebut **belum diputuskan**; jangan nolkan atau gandakan nilai tanpa dasar. Alokasi dan penggunaan ulang lintas subklasifikasi tetap G2, bukan diselesaikan oleh contoh G1. |

**Hasil G1 per 22 Oktober 2026:** pembacaan contoh dan perbedaan dua uji
telah dipertajam; kepastian penerapan **belum terselesaikan**. Untuk menutup
masing-masing baris diperlukan bahan tertulis yang tersedia independen:
identitas/peran dan kompetensi ahli yang dapat diverifikasi, versi/cakupan
skema BG001 BUJKN, tanggal telaah, jawaban eksplisit beserta locator P/D
dan simulasi, alasan rekonsiliasi, batas/pengecualian, serta pengesahan yang
dapat diverifikasi. Bukti untuk satu baris tidak otomatis menutup baris
lain atau gerbang status sumber/operasional bagian 5. Tidak ada penelaah
yang ditunjuk atas nama lembaga oleh dokumen ini.

**Pertanyaan telaah G1 (jawaban tertulis ahli skema/LSBU diperlukan):**

1. Bagaimana P A.3.h.1.c/e dan D 5.1.2.3/4 dibaca bersama Simulasi 1
   untuk perpanjangan pertama, kedua, dan berikutnya? Apa batas pembacaan
   kondisi seluruh subklasifikasi tanpa pengalaman pada perpanjangan pertama,
   khususnya bila BUJKN hanya memiliki BG001 atau bila BG001 tanpa
   pengalaman tetapi subklasifikasi lain berpengalaman? Jangan menganggap
   ada toleransi enam tahun universal sejak SBU baru.
2. Apakah “dua periode berturut-turut” dan “enam tahun terakhir” alternatif
   yang setara hanya untuk periode penuh tiga tahun? Tanggal acuan apa yang
   dipakai (permohonan, habis berlaku, atau keputusan), bagaimana batas hari,
   dan apa akibat jeda SBU, perubahan kualifikasi, atau konversi yang masa
   berlakunya mengikuti SBU lama? Simulasi bukan jawaban lengkap kasus ini.
3. Kapan pengalaman dianggap diperoleh: tanggal kontrak, progres/BA,
   serah terima, atau pencatatan SIJK? Bagaimana kontrak tahun jamak yang
   melintasi dua periode diperlakukan tanpa membuat pengalaman semu?
4. Nilai apa dan periode mana yang dinilai untuk kualifikasi bila syarat
   minimal pengalaman dipenuhi dari periode sebelumnya? Bagaimana
   memisahkannya dari larangan penggunaan ulang lintas subklasifikasi?
5. Bila penelaah menyimpulkan tidak dapat diperpanjang, bagaimana hubungan
   P h.1.f dan D 5.1.2.5–6 mengenai tiga tahun sejak habis berlaku serta
   jalur permohonan baru? Tidak ada tanggal larangan yang dihitung dalam draf.

### 7.3. G2 — alokasi kontrak bukan penggandaan nilai atau izin penggunaan ulang

**Pembaruan 22 Oktober 2026:** [catatan telaah alokasi G2](bg001-contract-allocation-review-draft.md)
memeriksa ulang P/D dan membandingkan L dengan penanggung jawab skema
teridentifikasi (L PDF 2, 37–38, 98–100). Catatan itu memisahkan unit
kontrak/bagian/major item/rekaman, alokasi simultan versus penggunaan
berikutnya, porsi KSO/subpenyedia, addendum/RAB, progres tahun jamak, dan
agregasi per BUJK. **Bukan jawaban ahli; G2 tetap belum terselesaikan.**
L mengulang ketentuan D, tidak mengesahkan bagian yang boleh digunakan.

| Pokok dan locator | Pembacaan draf | Hal yang belum boleh disimpulkan |
| --- | --- | --- |
| Satuan penjualan — P PDF/cetak 260 A.3.h.2.b.1–5; D PDF 38/cetak 29 5.1.2.2/11/13 | Ambang K1–B tertulis **per BUJK**, sedangkan bukti dinilai sesuai lingkup setiap subklasifikasi dan akumulasi pada subklasifikasi yang dimiliki untuk perpanjangan/peningkatan. | Jangan menyalin seluruh omzet perusahaan ke BG001, menjumlahkan nilai sama berulang, atau menganggap “per BUJK” menghapus kebutuhan pembuktian BG001. Hubungan agregasi masih perlu telaah. |
| Kontrak dan porsi — D PDF 38/cetak 29 5.1.2.7–9 | Kontrak sah dapat berasal dari dalam/luar negeri; KSO/subpenyedia dipisahkan sesuai porsi; tahun jamak menggunakan BA progres dan nilai sesuai pentahapan kontrak. | Nilai total konsorsium bukan otomatis penjualan BUJKN pemohon. Nilai penuh kontrak tidak boleh diasumsikan muncul kembali setiap tahun/tahap. Ini bukan konfirmasi keabsahan bukti. |
| Alokasi lingkup — D PDF 38/cetak 29 5.1.2.10–11; PDF 95/cetak 86 butir 1 | Satu kontrak dapat terkait lebih dari satu subklasifikasi berdasarkan major item dan RAB; kontrak/bagian kontrak dinilai per lingkup. Formulir menulis nilai kontrak terakhir × porsi major item subklasifikasi yang dimohonkan. | Kaitan lintas subklasifikasi bukan hak memakai 100% nilai yang sama di setiap subklasifikasi. Formula formulir belum menentukan urutan kombinasi porsi KSO, major item, addendum dan progres. |
| Jejak penggunaan — D PDF 38/cetak 29 5.1.2.12; PDF 95/cetak 86 butir 2 | Pengalaman yang sudah digunakan pada subklasifikasi tertentu tidak dapat digunakan kembali untuk permohonan subklasifikasi berbeda; formulir meminta pernyataan belum pernah digunakan untuk subklasifikasi lain. | Jangan mengabaikan larangan karena angka 10 mengizinkan alokasi. Sebaliknya, jangan mengarang bahwa seluruh kontrak beserta semua bagian yang berbeda pasti selamanya terkunci. Unit larangan perlu dipastikan. |
| Pencatatan — P PDF/cetak 260 A.3.h.1.a–b; D PDF 38/cetak 29 5.1.2.1/14 | Pengalaman sah tercatat di SIJK; D menyebut dokumen elektronik diunduh dari integrasi E-SIMPAN untuk penilaian. | Menyebut mekanisme sumber bukan izin mengaktifkan integrasi atau menganggap unggahan/catatan manual sudah tervalidasi. Tidak ada akses SIJK/E-SIMPAN pada telaah ini. |

**Ilustrasi sintetis untuk pertanyaan alokasi, bukan formula aktif:** kontrak
Rp10 miliar dengan RAB major item BG001 Rp6 miliar dan lingkup lain Rp4
miliar tidak membenarkan mengisikan Rp10 miliar penuh ke masing-masing
lingkup. Rp6 miliar baru calon alokasi BG001, belum nilai pengalaman yang
disahkan; porsi pemohon, addendum, progres, periode dan riwayat penggunaan
masih harus diperiksa. Tidak ada perusahaan atau kontrak nyata yang dipakai.

### 7.4. Pertanyaan telaah G2 dan status hasil

Pertanyaan berikut tetap terbuka. Paket telaah tertulis **U/R/A**, hasil
penelusuran publik terbatas, batas atribusi kepada penanggung jawab L,
dan ilustrasi sintetis terinci ada pada
[catatan G2 bagian 2–7](bg001-contract-allocation-review-draft.md#7-paket-keputusan-yang-masih-dibutuhkan-dari-ahli-skemalsbu).
Urutan rekonsiliasi di sana merupakan usulan pemeriksaan bahan, **bukan
formula LSBU atau aturan aktif**. Tidak ada konsultasi yang diklaim terjadi.

1. Apa unit “pengalaman” pada D 5.1.2.12: seluruh kontrak, major item,
   bagian RAB, atau rekaman pengalaman? Bagaimana angka 10–11 dan
   pernyataan PDF 95 butir 2 mengizinkan/membatasi alokasi simultan
   dibanding permohonan subklasifikasi berbeda pada waktu berikutnya?
   Bagaimana bagian kontrak yang belum pernah digunakan diperlakukan?
2. Bukti apa yang menetapkan porsi BG001 dan porsi BUJKN dalam
   KSO/subpenyedia? Bila porsi tumpang tindih, bagaimana urutan rekonsiliasi
   nilai kontrak terakhir/addendum, major item/RAB, dan BA progres, termasuk
   perubahan lingkup, pekerjaan bersama yang tidak terpisah dan pekerjaan
   lintas periode? Jangan memakai pembagian rata atau judul kontrak saja;
   jangan mengalikan semua persentase tanpa memastikan basisnya sama,
   mengurangi porsi dua kali, atau mengatribusikan porsi pihak lain.
3. Bagaimana memastikan setiap bagian/progres hanya dihitung sesuai hak
   pemohon, dengan rekonsiliasi terhadap nilai kontrak yang relevan,
   tanpa menggandakan nilai antaranggota KSO, subpenyedia, subklasifikasi,
   tahap, tahun atau periode? Jejak penggunaan apa yang cukup bagi penelaah?
   Bagaimana histori alokasi/pemakaian sebelumnya direkonsiliasi dengan
   bukti tercatat? “Belum diketahui pernah digunakan” bukan “belum pernah
   digunakan”; dokumen yang belum diunggah bukan bukti tidak adanya pengalaman.
4. Bagaimana ambang **per BUJK** P h.2.b dihubungkan dengan akumulasi
   subklasifikasi pada D 5.1.2.11/13 untuk perpanjangan dan peningkatan
   BG001? Apakah penggunaan pada perpanjangan subklasifikasi yang sama
   diperbolehkan untuk uji minimal pengalaman, dan bagaimana membedakannya
   dari menghitung kembali nominal penjualan? Jangan memperluas larangan
   “subklasifikasi berbeda” menjadi larangan semua pemakaian ulang.

**Hasil adendum:** locator lampiran dan perilaku diagram BG001 sudah
diperiksa visual; ambiguitas penerapan periode dan unit larangan penggunaan
ulang dipertahankan secara eksplisit. Jawaban telaah harus mencatat locator,
jenis permohonan, alasan, identitas/kompetensi penelaah dan batas penerapan,
serta mengikuti gerbang sumber/status operasional bagian 5 sebelum ada
pekerjaan aturan terpisah. Tidak ada penolakan/perpanjangan otomatis,
perubahan skor, migrasi kasus, data perusahaan atau koneksi live.

Jika kelak ditetapkan spesifikasi, bahan telaah perlu memisahkan riwayat
periode SBU BG001, tanggal/peristiwa pengalaman, nilai/porsi/progres,
bagian major item/RAB, serta histori pemakaian dan locator bukti. Ini
daftar kebutuhan konseptual, **bukan perubahan skema atau pengumpulan
data perusahaan pada pekerjaan ini**.

## 8. Adendum G4–G5 — minimum unit bukan daftar belanja BG001 BUJKN

Telaah lanjutan **20 Oktober 2026** atas halaman P/D pada kunci sumber di
atas dan bahan pelengkap publik dari penerbit/SIMPK di bawah. Nomor PDF
1-based; nomor cetak untuk P/D diperiksa pada render, bukan dihitung dari
offset. P/D adalah dasar pembacaan draf BG001; materi SIMPK menjelaskan
pencatatan peralatan umum, **bukan** keputusan LSBU bahwa suatu jenis,
spesifikasi, atau satuan tertentu memenuhi BG001. Belum ada klarifikasi
resmi spesifik BG001 yang ditemukan dalam pemeriksaan sumber pelengkap ini
tentang hitungan set scaffolding, dua unit sejenis B, atau padanan nama
alat. Ketiadaan temuan **bukan** bukti klarifikasi tersebut tidak ada.
Gerbang status/operasional bagian 5 tetap berlaku. Tidak ada konsultasi
ke pihak luar, permintaan data perusahaan, pengadaan, aktivasi aturan,
checklist wajib universal, atau koneksi SIJK/SIMPK dalam pekerjaan ini.

### 8.1. Rantai locator dan bobot sumber pelengkap

| Sumber dan locator | Hasil yang dapat dipakai | Batas yang tidak dijawab sumber |
| --- | --- | --- |
| P PDF/cetak 18 angka 3.e baris **BG001 (K)**; PDF/cetak 19 kelanjutan 3.e baris **BG001 (M/B)** | Masing-masing baris berisi **daftar nama jenis alat** untuk cakupan kualifikasinya. `scaffolding` tertulis pada kedua baris; beberapa entri memakai garis miring, misalnya `grinder/mesin gerinda` (K), `compactor roller/vibrator roller` dan `flat bed truck/trailer` (M/B). Baris **GT001 (B)** di bawah BG001 bukan lanjutan daftar BG001. | Tidak ada kata “seluruh”, jumlah per nama, spesifikasi/kapasitas minimum, atau definisi unit/set scaffolding pada dua baris itu. Garis miring tidak dengan sendirinya berarti dua unit maupun dua kewajiban jenis. |
| P PDF/cetak 265 A.3.k.1–5; D PDF 30/cetak 21 tabel 3.2.4 | Untuk Pekerjaan Konstruksi: Kecil **≥1 unit**, Menengah **≥1 unit**, Besar **≥2 unit**, masing-masing **per subklasifikasi**. P k.4 membatasi pemakaian jenis sama untuk subklasifikasi lain; k.5 membolehkan milik sendiri/sewa beli/sewa. | Tabel hanya menyebut **unit**, bukan “jenis berbeda”; tidak dapat diubah menjadi kewajiban membeli semua item P 18–19. Belum ada aturan penghitungan fisik komponen alat modular. |
| [Daftar Subvarian Peralatan dan Satuan — SIMPK](https://simpk.pu.go.id/pencatatan/subvarian-satuan), tabel `REKAP PENCATATAN SDPK`, baris **122 Scaffolding** (kode SCA) dan **207 Scaffolding Shoring** (kode SCH); diakses 20 Oktober 2026 | Tabel publik memakai kolom **“satuan kapasitas”**: Scaffolding baris 122 `Meter`; Scaffolding Shoring baris 207 `M` dan `Kg` (ketinggian dan berat penopang). Pemisahan subvarian menguatkan perlunya identifikasi teknis. | Meter/kg adalah ukuran **kapasitas**, bukan konversi ke **jumlah unit SBU**. Tabel tidak memutuskan apakah satu rangka, satu set, satu sistem terpasang, atau satu catatan SIMPK setara satu unit BG001; juga tidak membuktikan `Scaffolding Shoring` dapat menggantikan nama `scaffolding` tanpa asesmen. |
| [Buku Praktis Digital Pencatatan SDMPK, DJBK (2021)](https://simpk.pu.go.id/dist/publikasi/of1d0m3cdzyn0fg1-Buku_Praktis_Digital_Pencatatan_SDMPK.pdf), PDF 12/cetak 5 definisi pemilik SDPK; PDF 57 (diagram “Alur Umum Pencatatan SDPK”, tanpa nomor cetak yang terlihat) | Pemilik dapat berupa badan usaha atau perseorangan; alur SIMPK pemilik mencakup identitas, jenis/subvarian, merek, model, **nomor seri**, kapasitas, bukti kepemilikan, foto unit/nameplate, pemeriksaan lalu penetapan pencatatan. Materi ini terbit sebelum P/D. | Alur pencatatan **milik pemohon SIMPK** tidak otomatis menjadi daftar dokumen wajib pemohon SBU yang menyewa atau memakai jalur komitmen; nomor seri/foto tidak otomatis menyelesaikan satuan set scaffolding yang modular. |
| [Artikel DJBK “Mengenal SIMPK”](https://binakonstruksi.pu.go.id/publikasi/karya-tulis/mengenal-simpk-sistem-digital-untuk-material-dan-peralatan-konstruksi-yang-lebih-transparan/), bagian “Apa Saja Isi dan Fitur SIMPK?”/“Pencatatan SDPK”; diakses 20 Oktober 2026 | Menjelaskan SIMPK sebagai bagian SIJK; membedakan input, evaluasi, status sementara/tetap/final/tercatat. Artikel membahas antara lain evaluasi pengadaan. | Artikel penjelasan, bukan aturan kelayakan BG001 atau alasan menyamakan validasi tender dengan asesmen SBU. Jangan menaikkan status data unggahan menjadi verifikasi final. |

Halaman [pengumuman DJBK Permen PU 6/2025](https://binakonstruksi.pu.go.id/pengumuman/peraturan-menteri-pekerjaan-umum-republik-indonesia-nomor-6-tahun-2025/)
menautkan PDF penerbit, tetapi penautan itu bukan klarifikasi rinci G4–G5,
verifikasi keaslian salinan D, atau bukti pemicu operasional bagian 5.
Buku 2021 dan tabel SIMPK tidak dipakai untuk menambah ambang SBU 2025/2026.

### 8.2. G4 — pisahkan daftar kandidat, unit fisik, dan pilihan teknis

| Skenario pembacaan, **bukan keputusan pemenuhan** | Apa yang sudah tertulis | Apa yang tetap ditahan |
| --- | --- | --- |
| Satu subklasifikasi BG001 K1/K2/K3 atau M | Minimum satu unit per subklasifikasi (P k.2.a–b; D 3.2.4), dengan rujukan nama jenis pada baris kualifikasi terkait P 18 atau 19. | **Tidak** satu unit *masing-masing nama* pada daftar. Jenis yang dipilih harus ditelaah kesesuaiannya, bukan otomatis semua nama sah bagi setiap pekerjaan. |
| Satu subklasifikasi BG001 B | Minimum **dua unit**, bukan frasa “dua jenis” (P k.2.c; D 3.2.4). | Dua unit **jenis sama** belum dikonfirmasi dapat diterima, tetapi draf juga tidak menciptakan kewajiban dua jenis berbeda. Perlu jawaban apakah identitas/kapasitas dua unit itu masing-masing harus berbeda dan bisa dipakai bersamaan. |
| `scaffolding` atau nama dengan garis miring | P 18–19 menyebut nama; SIMPK mengukur kapasitas scaffolding dan membedakan subvariannya (8.1). | Jangan menyamakan satu batang, satu frame, satu set, satu sistem, satu nomor pencatatan, meter, atau kilogram dengan “1 unit” tanpa definisi resmi yang relevan bagi BG001; jangan memecah entri dengan garis miring menjadi kewajiban membeli kedua nama. |
| Jenis dan spesifikasi yang diajukan | P 18–19 tidak memberi kapasitas teknis per alat; buku/tabel SIMPK dapat membantu mengidentifikasi varian/kapasitas untuk telaah. | Jangan menetapkan kapasitas/jenis ideal sendiri, memakai spesifikasi tender sebagai ambang SBU, atau menyetarakan sinonim, varian, dan alat pengganti tanpa dasar penelaah. |

### 8.3. G5 — matriks jalur penyediaan, bukti dan pencatatan

| Jalur/isu | Pembacaan yang ditopang locator | Batas bukti dan hal yang masih perlu diputuskan |
| --- | --- | --- |
| Kecil (K1/K2/K3) vs M/B | P PDF/cetak 265 k.2, k.8–11 menyebut minimum dan pencatatan SIJK; D PDF 40/cetak 31 5.1.5.3–6 memperjelas **M/B dicatat di SIJK melalui SIMPK**, sementara **Kecil tidak wajib mencatat alat di SIMPK**. | Kecil tetap punya minimum dan kebutuhan pembuktian kelayakan; pengecualian SIMPK **bukan** pengecualian alat, izin bukti apa saja tanpa pemeriksaan, atau penghapusan SIJK untuk **komitmen**. Untuk M/B, status sementara/tetap/final/tercatat disebut sebagai kemungkinan pemenuhan pencatatan untuk penilaian, **bukan** semua status telah diverifikasi sama atau kepemilikan wajib. |
| Alat tersedia melalui milik sendiri | P PDF/cetak 265 k.5–6 dan D PDF 40/cetak 31 5.1.5.1.a/2 memberi contoh bukti hak milik: faktur, akta, kuitansi, hibah, neraca aset, atau bukti sah lain. | Bukti yang diajukan harus dikaitkan ke alat, hak dan pemohon yang dinilai; salinan/unggahan saja bukan keabsahan atau verifikasi. Buku SIMPK PDF 57 menerangkan alur pemilik, bukan daftar tambahan universal syarat SBU. |
| Sewa beli / sewa | P k.5/7 membolehkan keduanya dan menulis perjanjian dengan pemilik; D 5.1.5.1.b–c memperinci **sewa beli dengan Perusahaan Pembiayaan**, **sewa dengan pemilik alat**, sedangkan D 5.1.5.2.e juga mencantumkan perjanjian sewa beli pada kelompok “bukti hak milik”. | Jangan memaksa pembelian tunai, mencampur pihak sewa dengan pembiayaan, ataupun membaca pengelompokan D sebagai bukti sewa beli selalu berarti hak milik sudah beralih. Validitas dan waktu berlaku perjanjian serta kaitan dengan unit perlu telaah. |
| Komitmen kesanggupan | P PDF/cetak 265 k.12–13 dan 266 k.14; D PDF 40–41/cetak 31–32 5.1.5.7–9: **jalur pemenuhan kemampuan** lewat pernyataan untuk menyediakan pada setiap pekerjaan selama masa berlaku SBU, **tercatat di SIJK**, ditandatangani PJBU. D PDF 66/cetak 57 bagian 21.A: format satu surat memilih Kecil/Menengah/Besar, menyatakan memiliki/sewa/sewa beli **saat pelaksanaan pekerjaan**. | Surat adalah bukti **komitmen**, bukan bukti unit sudah ada/dibeli/disewa atau tercatat di SIMPK. Jangan menghapus angka 1/1/2 unit; jangan pula memaksa bukti transaksi seluruh daftar sebelum memilih jalur yang sah. Sumber tidak membatasi jalur ini pada SBU pertama, tetapi kecukupan dan pengecekan saat pelaksanaan perlu penelaah. Jangan meminjam tenggat komitmen SMAP. |
| Jenis sama untuk subklasifikasi lain | P PDF/cetak 265 k.4 dan D PDF 41/cetak 32 5.1.5.10: dapat dipakai untuk syarat peralatan utama **subklasifikasi lain paling banyak lima dalam satu klasifikasi yang sama**. | Tidak ada izin eksplisit penggunaan lintas klasifikasi/BUJK tanpa batas; jangan menyimpulkan 5 adalah total termasuk subklasifikasi asal atau 5 tambahan, ataupun alat yang sama boleh dihitung dua kali sebagai dua unit B dalam **satu** subklasifikasi. Periksa identitas, ketersediaan dan kapasitas nyata untuk penggunaan bersama. |

Pemisahan yang harus dipertahankan: **(1) jenis kandidat**, **(2) jumlah
unit minimum per subklasifikasi**, **(3) jalur kemampuan menyediakan**,
**(4) bukti hak/perjanjian atau bukti komitmen**, **(5) pencatatan alat
M/B pada SIJK melalui SIMPK**, dan **(6) pencatatan komitmen pada SIJK
untuk jalur komitmen**. Yang satu tidak menggantikan semua yang lain.
Konsekuensi spesifik per jenis permohonan belum disahkan.

### 8.4. Pertanyaan siap ditelaah, bukan permintaan yang telah dikirim

Mintakan jawaban **tertulis dengan locator sumber dan versi skema yang
berlaku**, identitas/kompetensi penelaah serta cakupan jenis permohonan
(baru/perubahan/perpanjangan) dan kualifikasi (Kecil/M/B). Bila belum ada
dasar, catat “belum diputuskan”; jangan ubah ketidaktahuan menjadi
persyaratan belanja atau otomatis lulus.

1. **Unit/scaffolding (G4):** Untuk P 18–19 3.e dan P 265 k.2/D 30
   3.2.4, apa definisi satu unit `scaffolding` BG001 per kualifikasi:
   frame, set lengkap yang laik pakai, sistem, atau identitas alat lain?
   Bagaimana membuktikan kuantitas, ketersediaan, kapasitas dan pemisahan
   dua unit B bila komponennya modular/berbagi? Apakah SIMPK baris 122
   (Meter) atau 207 (M/Kg) relevan untuk **identifikasi kapasitas saja**,
   dan dokumen apa menghubungkan subvarian dengan nama BG001?
2. **Dua unit dan pilihan jenis (G4):** Untuk B, bolehkah dua unit
   independen dari **jenis yang sama**, atau harus dua jenis berlainan?
   Bila ada ketentuan spesifikasi/kapasitas untuk tiap pilihan P 19,
   mohon locator dan dasar yang berlaku pada BG001. Bagaimana menilai
   nama bergaris miring/sinonim atau varian berbeda; apakah satu jenis
   boleh dipilih dari daftar terkait tanpa mewajibkan seluruh daftar?
3. **Lintas subklasifikasi (G5):** Pada P 265 k.4/D 41 5.1.5.10,
   “subklasifikasi lain paling banyak 5” berarti lima **lainnya** selain
   asal atau lima total? Apa bukti identitas, hak pakai, kapasitas dan
   ketersediaan bila jenis/unit sama diklaim untuk beberapa
   subklasifikasi **dalam satu klasifikasi**; adakah batas tambahan
   untuk waktu pemakaian bersamaan? Tegaskan apakah klaim lintas
   klasifikasi/BUJK dan dua hitungan unit B atas satu alat fisik ditolak.
4. **Milik, sewa beli, sewa (G5):** Bagaimana P 265 k.6–7 dan D 40
   5.1.5.1–2 dipertemukan untuk bukti sewa beli dengan perusahaan
   pembiayaan, termasuk perbedaan pengelompokan “bukti hak milik”?
   Bukti apa yang cukup untuk mengikat identitas setiap unit, hak pakai,
   periode berlaku dan pihak terkait tanpa memaksa pemohon memiliki alat?
5. **Komitmen vs alat (G5):** Untuk masing-masing Kecil, M dan B,
   jenis permohonan apa yang dapat memakai P 265–266 k.12–14/D
   40–41 5.1.5.7–9 dan format D 66 bagian 21.A? Bukti apa memastikan
   surat PJBU **tercatat di SIJK**; kapan, oleh siapa dan dengan bukti apa
   pemenuhan 1/1/2 unit diperiksa **saat pelaksanaan pekerjaan**?
   Bagaimana dibedakan antara komitmen, perjanjian yang sudah berlaku,
   alat yang tersedia, dan status pencatatan SIMPK?
6. **Pencatatan dan pengecualian Kecil (G5):** Ketika memakai bukti
   alat tersedia, bagaimana mengevaluasi Kecil yang **tidak wajib**
   mencatat alat di SIMPK menurut D 40 5.1.5.5? Untuk M/B, status
   SIMPK yang disebut D 5.1.5.6 mana yang diterima, dengan verifikasi
   apa dan kapan? Jika memakai komitmen, apakah ada pencatatan SIMPK
   terpisah saat alat disediakan, atau SIJK untuk surat cukup pada tahap
   sertifikasi? Minta rujukan sebelum menganggap dua pencatatan identik.

**Status:** G4–G5 diperdalam tetapi **tetap terbuka untuk penerapan**.
Jawaban tersebut dan gerbang bagian 5 diperlukan sebelum spesifikasi
aturan terpisah. Tidak ada daftar pengadaan atau validasi perusahaan
yang dihasilkan dari telaah ini.

## Mengulang pemeriksaan

```sh
python .agents/scripts/review-sbu-source-pages.py attached_assets/permen-pu-6-2025_1791292204964.pdf 18 19 259 260 261 262 263 264 265 266 12 13
python .agents/scripts/review-sbu-source-pages.py attached_assets/KEP_DIRJEN_BK_281_STANDAR_SKEMA_SERTIFIKASI_26_AGUSTUS_2026_SU_1791292262823.pdf 18 28 29 30 38 39 40 41 66 83 84 85 1 4 5
# Tambahan adendum G1–G2:
python .agents/scripts/review-sbu-source-pages.py attached_assets/KEP_DIRJEN_BK_281_STANDAR_SKEMA_SERTIFIKASI_26_AGUSTUS_2026_SU_1791292262823.pdf 38 39 83 84 85 95
python .agents/scripts/review-sbu-source-pages.py attached_assets/permen-pu-6-2025_1791292204964.pdf 260
# Pendalaman G1: identitas bahan lembaga dan konteks konversi, bukan konsultasi:
python .agents/scripts/review-sbu-source-pages.py attached_assets/1._Format_Standar_Skema_Sertifikasi_BG_1792455848045.pdf 2 37 38 87
python .agents/scripts/review-sbu-source-pages.py attached_assets/permen-pu-6-2025_1791292204964.pdf 13
# Tambahan adendum G4–G5:
python .agents/scripts/review-sbu-source-pages.py attached_assets/permen-pu-6-2025_1791292204964.pdf 18 19 265 266
python .agents/scripts/review-sbu-source-pages.py attached_assets/KEP_DIRJEN_BK_281_STANDAR_SKEMA_SERTIFIKASI_26_AGUSTUS_2026_SU_1791292262823.pdf 30 40 41 66
# Buku SIMPK pelengkap di 8.1 memiliki locator PDF 12 dan 57 pada URL yang ditautkan.
```

Tidak ada perubahan aplikasi sehingga tidak diperlukan restart workflow,
uji browser atau skor simulasi. Pemeriksaan deliverable berupa pencocokan
visual halaman sumber, batas cakupan, locator dan tautan dokumentasi.
