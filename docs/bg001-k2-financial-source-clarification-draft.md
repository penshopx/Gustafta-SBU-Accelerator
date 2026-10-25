# Catatan sumber keuangan K2 — BG001 BUJKN (draf telaah manusia)

Tanggal pemeriksaan: **25 Oktober 2026**. Ruang lingkup hanya kemampuan
keuangan K2 untuk BG001 BUJKN, bukan penjualan tahunan, PMA atau KPBUJKA.
Ini adendum atas [pembandingan skema lembaga](bg001-institutional-scheme-comparison-draft.md),
**bukan aturan aktif, pengesahan koreksi, atau keputusan kelayakan**.

## Kesimpulan dan status klarifikasi

- Draf pembandingan 20 Oktober melaporkan angka Rp1.000.000.000,00 versus
  terbilang “lima ratus juta rupiah” pada L PDF 23/cetak 9, bagian 3.2 K2.
  Laporan itu tetap disimpan sebagai riwayat, **bukan kutipan yang berhasil
  direproduksi dari berkas sekarang**.
- Pemeriksaan ulang gambar **dan** teks native berkas L yang tersedia
  sekarang menunjukkan “paling sedikit Rp1.000.000.000,00 (satu miliar
  rupiah) per BUJK”. Tidak ditemukan beda angka/terbilang pada locator itu.
  Ini pengamatan atas salinan dengan sidik berkas di bawah, bukan bukti
  siapa mengubahnya, kapan berubah, atau apakah draf awal salah membaca.
- Salinan P dan D pada locator yang ditugaskan sama-sama menyebut
  Rp1.000.000.000,00 (“satu miliar rupiah”). Kecocokan ini mendukung
  pembandingan nominal satu miliar, **bukan otorisasi mengaktifkan ambang**.
- **Status erratum/versi koreksi sah penerbit: belum terkonfirmasi.**
  Penelusuran publik terbatas di bawah tidak menemukan erratum yang dapat
  dihubungkan secara terverifikasi dengan laporan konflik tersebut.
  Tidak ditemukan bukan berarti tidak pernah diterbitkan.
- **Status asal laporan “lima ratus juta”: belum terkonfirmasi.** Belum ada
  salinan terdahulu yang teridentifikasi dengan hash atau citra halaman
  untuk membuktikan tulisan itu pernah ada pada versi tertentu.
  Jangan menyatakan “penerbit telah mengoreksi”, “hanya salah ketik”,
  atau “konflik resmi telah selesai”.

## Locator dan identitas salinan yang diperiksa

Nomor PDF berikut 1-based; nomor cetak dibaca dari halaman, bukan dihitung
dengan offset seragam. Tiga halaman dirender ulang menggunakan
`.agents/scripts/review-sbu-source-pages.py` dan dibaca visual bersama teksnya.
Nama berkas bukan bukti versi; SHA-256 mengidentifikasi byte yang diperiksa,
bukan menjamin keaslian atau persetujuan lembaga.

| ID | Salinan dan identitas | Locator dan temuan |
| --- | --- | --- |
| L | `attached_assets/1._Format_Standar_Skema_Sertifikasi_BG_1792455848045.pdf`; 1.733.999 byte, 206 halaman. Header SSBG.1.LSBU-KI, edisi/revisi 01/11, berlaku sejak 21.10.2022, review 21.09.2026. | PDF 23/cetak 9, 3.2, baris subkualifikasi Kecil 2 (K2): Rp1.000.000.000,00, “satu miliar rupiah”, paling sedikit per BUJK. Header halaman 9 dari 192. |
| P | `attached_assets/permen-pu-6-2025_1791292204964.pdf`; 5.385.289 byte, 393 halaman. | PDF/cetak 261, A.3.i.2.b.2: K2 paling sedikit Rp1.000.000.000,00 (“satu miliar rupiah”) per BUJK. A.3.i.1.a pada halaman yang sama mendefinisikan modal usaha/ekuitas di luar tanah dan bangunan; bukan omzet atau total aset. |
| D | `attached_assets/KEP_DIRJEN_BK_281_STANDAR_SKEMA_SERTIFIKASI_26_AGUSTUS_2026_SU_1791292262823.pdf`; 4.689.346 byte, 186 halaman. | PDF 28/cetak 19, 3.2.2, baris K2: paling sedikit Rp1.000.000.000,00 (“satu miliar rupiah”) per BUJK. |

SHA-256 hasil pembacaan berkas:

```text
L d457e9c533e7c2aa1a84cea9bfc3007e5795cc14ad079a80411217d0677cc7d5
P 117f681ebd049e02d886864e49ad20104cfd4001f613e2c208271a80eec81d47
D 8055de1c63f7139a680540ae6da789c663029b4a5d1683a1e2ca28a4259a588f
```

## Penelusuran publik dan batas hasil

Semua akses di bawah dilakukan pada tanggal pemeriksaan. Tidak mengirim
pertanyaan, formulir, surel, atau pesan kepada instansi maupun lembaga.
Pembacaan hanya halaman publik sumber/regulasi, tanpa membuka data
perusahaan, portal permohonan, atau integrasi.

| Sumber/locator publik | Hasil akses dan kegunaan | Status untuk klarifikasi K2 |
| --- | --- | --- |
| [Beranda penerbit LSBU KI](https://www.lsbukonstruksi.co.id/) | Halaman dapat dibaca. Pengumuman yang terlihat antara lain SK 37/KPTS/DK/2025 dan witness 24 Oktober 2025. Tidak terlihat pengumuman erratum K2 atau revisi 01/11 yang menyatakan pembetulan terbilang. Bukan pemeriksaan seluruh arsip situs. | Belum ditemukan konfirmasi koreksi; umur pengumuman bukan bukti versi terbaru tidak ada. |
| [PDF publik BG penerbit](https://lsbukonstruksi.co.id/assets/skemasertifikasi/2SKEMASSBG.pdf) | Unduhan HTTP 200, 1.538.444 byte, **96 halaman menurut pembaca PDF**. PDF 2/cetak 1: SSBG.2.LSBU-KI, 01/07, review 21.11.2024. PDF 16–17/cetak 15–16 bagian 3.1.2; gambar PDF 17 memuat tabel keuangan “Kecil” Rp300 juta per subklasifikasi, tanpa pemisahan K1/K2/K3. | Dokumen berbeda dan lebih lama menurut header, **bukan erratum L 01/11**, bukan dasar mengambil Rp300 juta atau Rp500 juta untuk K2. Tidak menyamakan kode SSBG.2 dengan SSBG.1. |
| [Pengumuman resmi DJBK Permen PU 6/2025](https://binakonstruksi.pu.go.id/pengumuman/peraturan-menteri-pekerjaan-umum-republik-indonesia-nomor-6-tahun-2025/) | Dapat dibaca; viewer menunjuk [PDF resmi](https://binakonstruksi.pu.go.id/storage/permen-pu-6-2025.pdf). Pengunduhan PDF langsung pada sesi ini mendapat HTTP 403; **tidak dilakukan pencocokan byte PDF publik dengan P**. Pembacaan angka halaman 261 menggunakan lampiran lokal P. | Locator penerbit Permen ditemukan; bukan pengesahan versi L atau erratum lembaga. |
| [Metadata JDIH PU Permen 6/2025](https://jdih.pu.go.id/detail-dokumen/PermenPU-nomor-6-tahun-2025-Standar-Kegiatan-Usaha-danatau-Standar-ProdukJasa-Pelaksanaan-Pengawasan-dan-Pengenaan-Sanksi-pada-Penyelenggaraan-Perizinan-Berusaha-Berbasis-Risiko-Sektor-Pekerjaan-Umum) | Muncul dalam hasil pencarian; pembacaan halaman gagal (500). Tidak mengambil status hukum terkini dari cuplikan pencarian. | Tidak memberikan klarifikasi K2 pada pemeriksaan ini. |
| [Kategori surat keputusan DJBK](https://binakonstruksi.pu.go.id/category/produk/produk-hukum/surat-keputusan/) | Halaman dapat dibaca; daftar yang dikembalikan memuat keputusan 114/2024 dan 33/2023, bukan salinan 281/2026 atau ralat K2. Penelusuran nomor 281/2026 juga belum menghasilkan locator publik yang dapat diverifikasi. | D tetap pembanding **salinan lampiran**, bukan klaim autentikasi publik, keberlakuan terkini atau pembatalan. Daftar itu tidak membuktikan 281/2026 belum diterbitkan. |

SHA-256 PDF publik BG 01/07:
`2f4d5c4cf0e114c7bb41535d6c75aa7277f057d27b44b832071580efe1d489b6`.
Unduhan dan render kerja disimpan sementara di `/tmp/k2-source-review`;
tidak ditambahkan ke korpus aplikasi maupun penyimpanan dokumen pengguna.

Kueri penelusuran yang digunakan, selain membaca URL di atas:

```text
"SSBG.1.LSBU-KI"
site:lsbukonstruksi.co.id "01 / 11"
site:lsbukonstruksi.co.id "2026" "skema"
site:lsbukonstruksi.co.id "ralat"
site:lsbukonstruksi.co.id ralat K2
site:lsbukonstruksi.co.id skemasertifikasi
"281/KPTS/DK/2026"
site:pu.go.id "281" "2026" "sertifikasi"
"skema" "K2" "ralat"
```

Pencarian umum juga menghasilkan halaman tidak relevan dan jasa komersial;
tidak dipakai sebagai bukti koreksi. Hasil pencarian bukan pencarian
menyeluruh semua versi publik, dan cuplikan bukan bukti isi PDF.

## Perlakuan aman untuk penelaah

1. Bedakan tiga hal: laporan konflik awal, pembacaan salinan saat ini,
   dan pengesahan/riwayat versi penerbit. Hanya pembacaan salinan saat ini
   yang terkonfirmasi pada pemeriksaan ini.
2. Jika tersedia salinan dengan “lima ratus juta”, cocokkan identitas,
   hash, halaman, tanggal perolehan dan asal unduhnya. Jangan menimpa
   bukti lama dengan berkas bernama sama atau menganggap header sama
   menjamin byte yang sama.
3. Penutupan klarifikasi penerbit memerlukan sumber tertulis yang dapat
   ditelusuri: erratum atau versi sah dengan hubungan eksplisit ke
   dokumen/bagian/baris terkait, disertai telaah manusia yang berwenang.
   Tidak ada permintaan klarifikasi yang dikirim atas nama pengguna.
4. Jangan mengadopsi Rp500 juta, merata-ratakan angka, atau memakai
   “terbilang selalu menang” sebagai aturan otomatis. Jangan mengubah
   ambang runtime, mengaktifkan draf, menyunting kasus lama, atau mengubah
   koneksi live berdasarkan catatan ini.

## Pemeriksaan deliverable

Pemeriksaan terarah gambar/teks L PDF 23, P PDF 261 dan D PDF 28,
identifikasi versi pembanding publik, SHA-256 dan `git diff --check`.
Tidak mengubah PDF lampiran, kode, data perusahaan, aturan aktif atau
integrasi. Tidak memerlukan tes aplikasi, restart, atau publikasi.
