# Pemeriksaan lampiran PP 28/2025

## Lingkup — 6 Oktober 2026

Inventaris kini memuat 21 PDF unik dengan total 11.208 halaman PDF.
Unggahan pertama memuat 20 PDF (10.462 halaman); Lampiran II susulan menambah
746 halaman. Unggahan ulang Lampiran III/IV tidak menambah sumber unik.
Pemeriksaan mencakup jumlah halaman, hash SHA-256 lokal, teks halaman awal/akhir,
dan pemeriksaan visual terarah. Ini bukan telaah seluruh baris persyaratan,
validasi tanda tangan, atau pemeriksaan status hukum terkini terhadap penerbit.
Dokumen tidak diimpor ke database, rules engine, ataupun penyimpanan aplikasi.

## Inventaris ringkas

| Berkas/bagian | Halaman PDF |
| --- | ---: |
| I.A — kelautan dan perikanan | 364 |
| I.B — pertanian | 810 |
| I.C — kehutanan | 182 |
| I.D — energi dan sumber daya mineral | 1.056 |
| I.E — ketenaganukliran | 189 |
| I.F — perindustrian, delapan berkas | 5.691 |
| I.G — perdagangan dan metrologi legal | 341 |
| I.H — pekerjaan umum dan perumahan rakyat | 515 |
| Berkas berlabel I.I — transportasi | 411 |
| Berkas berlabel I.J–I.P | 500 |
| Berkas berlabel I.Q–I.V | 277 |
| Lampiran II — perizinan berusaha untuk menunjang kegiatan usaha | 746 |
| Lampiran III — metode analisis risiko | 18 |
| Lampiran IV — pedoman penyusunan standar kegiatan usaha/produk/jasa | 8 |
| **Total unik** | **11.208** |

Jumlah dan pemeriksaan batas berkas tidak membuktikan bahwa semua halaman
internal, sektor, atau kelanjutan baris tabel lengkap.

## Prioritas untuk SBU Accelerator

Lampiran I.H menjadi sumber utama penelaahan matriks sektor PU, bersama
Permen PU 6/2025 serta standar skema Kepdirjen yang sudah diterima.

- Judul sektor dicocokkan visual pada halaman PDF 1 (I.H.1).
- Contoh tabel diperiksa visual pada halaman PDF 8–9 (I.H.8–I.H.9):
  KBLI 41011, Konstruksi Gedung Hunian, subklasifikasi BG001.
- Tabel memisahkan ruang lingkup, skala usaha, tingkat risiko, perizinan,
  persyaratan, waktu penerbitan, kewajiban, parameter, dan kewenangan.
  Sel skala usaha bukan otomatis master kualifikasi sertifikasi SBU.
- Baris besar/BUJK asing dan kelanjutan persyaratan melintasi halaman.
  Jangan menyalin satu halaman sebagai satu aturan lengkap.
- Waktu pada kolom penerbitan bukan janji durasi keseluruhan layanan atau
  jaminan selesainya sertifikasi.
- Ekstraksi native memiliki salah baca kode/huruf dan susunan kolom.
  Pasangan kode, judul, cakupan, serta persyaratan harus ditelaah visual
  sebelum calon aturan dapat diterbitkan.
- Lampiran III dan IV membantu memahami metode serta struktur standar;
  bukan pengganti matriks sektor atau ambang sertifikasi spesifik.

Hash lokal berkas prioritas:

| Sumber | SHA-256 |
| --- | --- |
| I.H | `0341f2849ac502ff350024b75c93225d754988380ace44fd9a04c20cf7ebe504` |
| II | `83c1c651889194d176ac206b86a67f4a3a85da458820498693d84be590f094cb` |
| III | `55b71be9e4dcff28cdec24b7242663358b42e3ce41edb45ae7da07bc41e2921e` |
| IV | `63bd92a6a0dd94d73746b81cc3bf8eed6aefc16ff2f7b13e06b3fc232da2a8aa` |

Hash lampiran ini belum dicocokkan dengan manifest penerbit/Knowledge Pack;
hash lokal adalah identitas berkas, bukan pembuktian keaslian.

## Lampiran II serta unggahan ulang III/IV

- Identitas Lampiran II PP 28/2025 dan struktur tabel PB UMKU dicocokkan
  visual pada halaman PDF 1. Salinan memuat 746 halaman; halaman terakhir
  berlabel II.U.5 pada ekstraksi teks.
- Ini bahan penelaahan Perizinan Berusaha untuk Menunjang Kegiatan Usaha,
  bukan daftar syarat SBU universal. Cakupan tiap izin, parameter, persyaratan,
  kewajiban, dan masa berlaku perlu ditelaah sesuai sektor/aktivitas terkait.
- Lampiran III dan IV susulan masing-masing cocok SHA-256 dengan berkas
  sebelumnya. Catat sebagai unggahan ulang sumber yang sama, bukan revisi
  peraturan atau dua tambahan dokumen.
- Pemeriksaan Lampiran II masih terarah pada identitas dan batas berkas;
  bukan penelaahan seluruh 746 halaman atau kelengkapan setiap sektor.

## Catatan kelengkapan

- Lampiran II sudah diterima melalui unggahan susulan. Kelompok Lampiran
  I–IV kini tersedia sebagai bahan penelaahan; ini tidak membuktikan seluruh
  halaman internal dan tabel sudah lengkap atau telah diverifikasi.
- Berkas `2.6h` bernama rentang I.F.5249–11000 sebenarnya berisi 443 halaman.
  Halaman pertama berlabel I.F.5249 dan halaman terakhir I.F.5691; label
  terakhir dicocokkan visual. Simpan nama asli sebagai provenance, tetapi
  jangan menjadikan angka 11000 sebagai jumlah atau batas isi aktual.
  Perbedaan nama ini saja tidak membuktikan kehilangan halaman.
- Surat pemicu operasional SIJK tetap belum tersedia dari unggahan ini.
  Jangan membuat tenggat kalender transisi dari adanya lampiran PP.
- Status gap matriks sektor PU berubah menjadi **sumber diterima, menunggu
  telaah**, bukan persyaratan final atau kelayakan jual yang telah terpenuhi.

## Mengulang pemeriksaan

`python .agents/scripts/inspect-pp28-annexes.py` menampilkan jumlah halaman,
hash tiap PDF, dan cuplikan batas berkas. Gambar awal berkas ditulis ke
`/tmp/pp28-annex-review`; tidak ada penyalinan PDF ke storage SBU.
Tanpa argumen, script memeriksa paket 20 berkas awal; berikan path PDF sebagai
argumen untuk memeriksa lampiran susulan tanpa memproses ulang paket besar.
